import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Download, Search, Upload, MapPin } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import {
  resolveWorldPopLGA,
  projectPopulation,
  reconcilePopulation,
  lgaPopKey,
  type EstimateSource,
} from "@/lib/microplanning/populationReconciliation";

const PLAN_YEARS = [2026, 2027, 2028, 2029, 2030];

type Entry = {
  id: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  community_name?: string | null;
  settlement_name?: string | null;
  estimated_total_population?: number | null;
  year_of_microplanning?: number | null;
};

interface Baseline { worldpop?: number | null; grid3?: number | null }
const BASELINE_KEY = "microplan_historical_baselines_v1";

function loadBaselines(): Record<string, Baseline> {
  try { return JSON.parse(localStorage.getItem(BASELINE_KEY) || "{}"); } catch { return {}; }
}
function saveBaselines(b: Record<string, Baseline>) {
  try { localStorage.setItem(BASELINE_KEY, JSON.stringify(b)); } catch { /* noop */ }
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function locKey(e: Entry): string {
  return [e.state, e.lga, e.ward, e.community_name, e.settlement_name].map((x) => (x || "").trim().toLowerCase()).join("|");
}

interface RowData {
  key: string;
  state?: string | null; lga?: string | null; ward?: string | null;
  community?: string | null; settlement?: string | null;
  yearMap: Record<number, number>;
  currentYear: number;
  previousYear: number | null;
  current: number;
  previous: number | null;
  pctChange: number | null;
}

const HistoricalDataReview = ({ entries }: { entries: Entry[] }) => {
  const [baselines, setBaselines] = useState<Record<string, Baseline>>(() => loadBaselines());
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [planYear, setPlanYear] = useState<number>(new Date().getFullYear() >= 2026 ? Math.min(new Date().getFullYear(), 2030) : 2026);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<RowData[]>([]);

  const updateBaseline = (key: string, patch: Partial<Baseline>) => {
    setBaselines((prev) => {
      const next = { ...prev, [key]: { ...(prev[key] || {}), ...patch } };
      saveBaselines(next);
      return next;
    });
  };

  // Flexible header matching: normalize and detect column meanings regardless of spelling/case/spacing.
  const normalizeHeader = (s: string) =>
    String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const detectColumns = (headers: string[]) => {
    const norm = headers.map(normalizeHeader);
    const findIdx = (matchers: ((h: string) => boolean)[]) => {
      for (const m of matchers) {
        const i = norm.findIndex((h) => h && m(h));
        if (i >= 0) return i;
      }
      return -1;
    };
    const locationIdx = findIdx([
      (h) => h === "community" || h === "settlement" || h === "location" || h === "village" || h === "communityname" || h === "settlementname",
      (h) => h.includes("community") || h.includes("settlement") || h.includes("location") || h.includes("village"),
    ]);
    const worldpopIdx = findIdx([
      (h) => h === "worldpop" || h === "wp" || h === "worldpoppopulation" || h === "worldpopestimate",
      (h) => h.includes("worldpop") || (h.includes("world") && h.includes("pop")),
    ]);
    const grid3Idx = findIdx([
      (h) => h === "grid3" || h === "gridthree" || h === "grid3population" || h === "grid3estimate",
      (h) => h.includes("grid3") || h.includes("gridthree") || (h.includes("grid") && h.includes("3")),
    ]);
    const wardIdx = findIdx([(h) => h === "ward", (h) => h.includes("ward")]);
    const lgaIdx = findIdx([(h) => h === "lga", (h) => h.includes("lga") || h.includes("localgovernment")]);
    const stateIdx = findIdx([(h) => h === "state", (h) => h.includes("state") || h.includes("province")]);
    return { locationIdx, worldpopIdx, grid3Idx, wardIdx, lgaIdx, stateIdx };
  };

  const parseDocxTables = async (file: File): Promise<string[][]> => {
    // Extract <w:tbl> rows from word/document.xml inside the .docx zip
    const buf = await file.arrayBuffer();
    // Use JSZip via dynamic import (already a project dep)
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return [];
    const rows: string[][] = [];
    const tblRegex = /<w:tbl[\s\S]*?<\/w:tbl>/g;
    const trRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
    const tcRegex = /<w:tc[\s\S]*?<\/w:tc>/g;
    const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    const tables = xml.match(tblRegex) || [];
    tables.forEach((tbl) => {
      const trs = tbl.match(trRegex) || [];
      trs.forEach((tr) => {
        const tcs = tr.match(tcRegex) || [];
        const row = tcs.map((tc) => {
          const texts: string[] = [];
          let m: RegExpExecArray | null;
          const r = new RegExp(tRegex);
          while ((m = r.exec(tc)) !== null) texts.push(m[1]);
          return texts.join("").trim();
        });
        if (row.some((c) => c)) rows.push(row);
      });
    });
    return rows;
  };

  const importFile = async (file: File) => {
    try {
      let rows: string[][] = [];
      const name = file.name.toLowerCase();
      if (name.endsWith(".docx")) {
        rows = await parseDocxTables(file);
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];
      }
      if (!rows.length) {
        toast({ title: "Import failed", description: "No tabular data found in file.", variant: "destructive" });
        return;
      }
      const headers = rows[0].map((h) => String(h ?? ""));
      const cols = detectColumns(headers);
      if (cols.locationIdx < 0 || (cols.worldpopIdx < 0 && cols.grid3Idx < 0)) {
        toast({
          title: "Missing required columns",
          description: "Need a Community/Settlement/Location column plus WorldPop and/or GRID3.",
          variant: "destructive",
        });
        return;
      }

      // Build lookup of existing rows by location tokens for fuzzy match.
      const indexByToken = new Map<string, string>(); // token -> rowKey
      rows0Tokens: for (const r of rowsRef.current) {
        const tokens = [r.community, r.settlement, r.ward, r.lga, r.state]
          .filter(Boolean)
          .map((x) => String(x).toLowerCase().trim());
        tokens.forEach((t) => { if (t && !indexByToken.has(t)) indexByToken.set(t, r.key); });
      }

      let matched = 0;
      let unmatched = 0;
      const updates: Record<string, Baseline> = {};
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every((c) => c === "" || c == null)) continue;
        const loc = String(row[cols.locationIdx] ?? "").toLowerCase().trim();
        if (!loc) continue;
        const ward = cols.wardIdx >= 0 ? String(row[cols.wardIdx] ?? "").toLowerCase().trim() : "";
        const lga = cols.lgaIdx >= 0 ? String(row[cols.lgaIdx] ?? "").toLowerCase().trim() : "";
        // Try direct match by location, then narrow by ward/lga concatenation
        let key = indexByToken.get(loc);
        if (!key && (ward || lga)) {
          // search any row whose ward+lga align AND community contains loc
          const cand = rowsRef.current.find((r) => {
            const c = String(r.community || "").toLowerCase();
            const s = String(r.settlement || "").toLowerCase();
            const wOk = ward ? String(r.ward || "").toLowerCase() === ward : true;
            const lOk = lga ? String(r.lga || "").toLowerCase() === lga : true;
            return wOk && lOk && (c === loc || s === loc || c.includes(loc) || loc.includes(c));
          });
          if (cand) key = cand.key;
        }
        if (!key) { unmatched++; continue; }
        const wp = cols.worldpopIdx >= 0 ? Number(String(row[cols.worldpopIdx]).replace(/[,\s]/g, "")) : NaN;
        const g3 = cols.grid3Idx >= 0 ? Number(String(row[cols.grid3Idx]).replace(/[,\s]/g, "")) : NaN;
        const patch: Baseline = {};
        if (Number.isFinite(wp) && wp > 0) patch.worldpop = wp;
        if (Number.isFinite(g3) && g3 > 0) patch.grid3 = g3;
        if (!Object.keys(patch).length) continue;
        updates[key] = { ...(updates[key] || {}), ...patch };
        matched++;
      }

      if (!matched) {
        toast({ title: "No rows matched", description: `${unmatched} rows could not be matched to existing microplan locations.`, variant: "destructive" });
        return;
      }
      setBaselines((prev) => {
        const next = { ...prev };
        Object.entries(updates).forEach(([k, v]) => { next[k] = { ...(next[k] || {}), ...v }; });
        saveBaselines(next);
        return next;
      });
      toast({ title: "Import complete", description: `Updated ${matched} location(s). ${unmatched ? `${unmatched} unmatched.` : ""}` });
    } catch (e: any) {
      toast({ title: "Import error", description: e?.message || "Failed to read file.", variant: "destructive" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const rows: RowData[] = useMemo(() => {
    const groups = new Map<string, Entry[]>();
    entries.forEach((e) => {
      if (!e.estimated_total_population || !e.year_of_microplanning) return;
      const k = locKey(e);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(e);
    });
    const out: RowData[] = [];
    groups.forEach((list, key) => {
      // average population per year (when duplicates)
      const byYear = new Map<number, number[]>();
      list.forEach((e) => {
        const y = Number(e.year_of_microplanning);
        const p = Number(e.estimated_total_population);
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y)!.push(p);
      });
      const yearMap: Record<number, number> = {};
      Array.from(byYear.entries()).forEach(([y, arr]) => {
        yearMap[y] = Math.round(arr.reduce((s, n) => s + n, 0) / arr.length);
      });
      const years = Object.keys(yearMap).map(Number).sort((a, b) => b - a);
      if (!years.length) return;
      const currentYear = years[0];
      const previousYear = years[1] ?? null;
      const current = yearMap[currentYear];
      const previous = previousYear != null ? yearMap[previousYear] : null;
      const pctChange = previous && previous > 0 ? ((current - previous) / previous) * 100 : null;
      const sample = list[0];
      out.push({
        key, state: sample.state, lga: sample.lga, ward: sample.ward,
        community: sample.community_name, settlement: sample.settlement_name,
        yearMap, currentYear, previousYear, current, previous, pctChange,
      });
    });
    return out.sort((a, b) => (Math.abs(b.pctChange ?? 0) - Math.abs(a.pctChange ?? 0)));
  }, [entries]);

  // Keep ref in sync for use inside async importFile callback.
  rowsRef.current = rows;

  const states = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.state) set.add(r.state); });
    return Array.from(set).sort();
  }, [rows]);

  // Aggregate current-year microplan population by LGA — used as the ancillary
  // weight for dasymetric disaggregation of the WorldPop LGA total down to each
  // community within that LGA.
  const lgaCurrentTotals = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = lgaPopKey(r.state, r.lga);
      m.set(k, (m.get(k) || 0) + (r.current || 0));
    });
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stateFilter !== "all" && r.state !== stateFilter) return false;
      if (!q) return true;
      return [r.state, r.lga, r.ward, r.community, r.settlement].some((x) => (x || "").toLowerCase().includes(q));
    });
  }, [rows, search, stateFilter]);

  // Resolve & geostatistically reconcile the best population estimate for a row.
  // 1. WorldPop LGA total (auto) → projected to the selected planning year →
  //    apportioned to the community by its share of the LGA current-year total
  //    (dasymetric / areal weighting).
  // 2. A manual WorldPop override (imported/typed) takes precedence when present.
  // 3. Sources reconciled with the median-anchored robust ensemble estimator.
  const computeRow = (r: RowData) => {
    const b = baselines[r.key] || {};

    // WorldPop baseline (LGA) + projection + dasymetric apportionment
    const lgaKeyN = lgaPopKey(r.state, r.lga);
    const lgaBaseline = resolveWorldPopLGA(r.state, r.lga);
    const lgaTotalCurrent = lgaCurrentTotals.get(lgaKeyN) || 0;
    let worldpopAuto: number | null = null;
    if (lgaBaseline != null) {
      const projectedLga = projectPopulation(lgaBaseline, planYear);
      const share = lgaTotalCurrent > 0 && r.current > 0 ? r.current / lgaTotalCurrent : null;
      worldpopAuto = share != null ? Math.round(projectedLga * share) : null;
    }
    const worldpop = b.worldpop != null ? Number(b.worldpop) : worldpopAuto;
    const grid3 = b.grid3 != null ? Number(b.grid3) : null;

    // Trend-project the current-year figure to the planning year for fair YoY use.
    const trendProjected = r.previous != null && r.pctChange != null
      ? Math.round(r.current * Math.pow(1 + Math.max(-0.05, Math.min(0.06, (r.pctChange / 100))), Math.max(0, planYear - r.currentYear)))
      : null;

    const sources: EstimateSource[] = [
      { label: `Current (${r.currentYear})`, value: r.current, weight: 1 },
    ];
    if (r.previous != null) sources.push({ label: `Previous (${r.previousYear})`, value: r.previous, weight: 0.6 });
    if (trendProjected != null) sources.push({ label: `Trend → ${planYear}`, value: trendProjected, weight: 0.8 });
    if (worldpop != null && worldpop > 0) sources.push({ label: `WorldPop ${planYear}`, value: worldpop, weight: 1.2 });
    if (grid3 != null && grid3 > 0) sources.push({ label: "GRID3", value: grid3, weight: 1 });

    const rec = reconcilePopulation(sources);
    return { worldpop, worldpopAuto, grid3, rec, geocoded: lgaBaseline != null };
  };


  const exportXlsx = () => {
    const data = filtered.map((r) => {
      const c = computeRow(r);
      return {
        State: r.state, LGA: r.lga, Ward: r.ward,
        Community: r.community, Settlement: r.settlement,
        [`Year ${r.currentYear} (Current)`]: r.current,
        [`Year ${r.previousYear ?? "—"} (Previous)`]: r.previous ?? "",
        "YoY % Change": r.pctChange != null ? r.pctChange.toFixed(1) + "%" : "",
        [`WorldPop ${planYear}`]: c.worldpop ?? "",
        "WorldPop source": c.worldpop == null ? "" : (baselines[r.key]?.worldpop != null ? "manual" : "auto (LGA dasymetric)"),
        "GRID3": c.grid3 ?? "",
        [`Recommended ${planYear}`]: c.rec.value,
        "Estimate range (low)": c.rec.low,
        "Estimate range (high)": c.rec.high,
        "Method": c.rec.method,
        "Rationale": c.rec.rationale,
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historical Review");
    XLSX.writeFile(wb, `Historical_Data_Review_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Exported", description: `${data.length} location rows exported.` });
  };

  const summary = useMemo(() => {
    const alerts = filtered.filter((r) => Math.abs(r.pctChange ?? 0) > 50).length;
    const totalCurrent = filtered.reduce((s, r) => s + r.current, 0);
    const totalPrev = filtered.reduce((s, r) => s + (r.previous ?? 0), 0);
    return { alerts, totalCurrent, totalPrev };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Historical Data Review
            <Badge variant="outline" className="ml-auto">{filtered.length} locations</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Compare current-year population estimates with previous campaigns and 3rd-party baselines
            (WorldPop, GRID3). The app recommends the most reasonable number to use for planning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total estimated (current year)</p>
              <p className="text-2xl font-bold tabular-nums">{summary.totalCurrent.toLocaleString()}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total estimated (previous year)</p>
              <p className="text-2xl font-bold tabular-nums">{summary.totalPrev.toLocaleString()}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Locations with implausible change</p>
              <p className="text-2xl font-bold tabular-nums text-red-600">{summary.alerts}</p>
            </CardContent></Card>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search community / settlement / ward" className="pl-7 h-8 text-xs" />
            </div>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All states" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={exportXlsx} disabled={!filtered.length}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.docx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); }}
            />
            <Button size="sm" variant="default" className="h-8 text-xs gap-1" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Import WorldPop / GRID3
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground -mt-1">
            Import an Excel (.xlsx/.csv) or Word (.docx) file with columns for Community/Settlement/Location plus WorldPop and/or GRID3 (any spelling/case).
          </p>

          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Current Year</TableHead>
                  <TableHead className="text-right">Previous Year</TableHead>
                  <TableHead className="text-right">YoY %</TableHead>
                  <TableHead className="text-right">WorldPop</TableHead>
                  <TableHead className="text-right">GRID3</TableHead>
                  <TableHead className="text-right">Recommended</TableHead>
                  <TableHead>Rationale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No microplan entries with population & year data yet.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((r) => {
                  const b = baselines[r.key] || {};
                  const rec = recommend(r);
                  const StatusIcon = rec.status === "ok" ? CheckCircle2 : rec.status === "warn" ? AlertTriangle : AlertTriangle;
                  const statusColor = rec.status === "ok" ? "text-green-600" : rec.status === "warn" ? "text-yellow-600" : "text-red-600";
                  return (
                    <TableRow key={r.key}>
                      <TableCell>
                        <div className="font-medium text-sm">{r.community || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.settlement ? `${r.settlement} · ` : ""}{r.ward} · {r.lga} · {r.state}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Year {r.currentYear}{r.previousYear ? ` vs ${r.previousYear}` : ""}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.current.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{r.previous?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.pctChange == null ? "—" : (
                          <span className={`inline-flex items-center gap-1 ${Math.abs(r.pctChange) > 50 ? "text-red-600 font-semibold" : r.pctChange > 0 ? "text-green-600" : "text-orange-600"}`}>
                            {r.pctChange > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {r.pctChange.toFixed(1)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={b.worldpop ?? ""}
                          onChange={(e) => updateBaseline(r.key, { worldpop: e.target.value ? Number(e.target.value) : null })}
                          placeholder="—"
                          className="h-7 w-24 text-xs text-right ml-auto"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={b.grid3 ?? ""}
                          onChange={(e) => updateBaseline(r.key, { grid3: e.target.value ? Number(e.target.value) : null })}
                          placeholder="—"
                          className="h-7 w-24 text-xs text-right ml-auto"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={`inline-flex items-center gap-1 font-bold tabular-nums ${statusColor}`}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {rec.value.toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[260px]">{rec.rationale}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Tip: Paste WorldPop and GRID3 estimates for each row to strengthen the recommendation. Values are
            saved locally on this device. The recommendation uses the median of all available sources, and flags
            year-over-year changes above 50% as implausible.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default HistoricalDataReview;
