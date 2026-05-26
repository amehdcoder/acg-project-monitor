import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Download, Search, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

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

  const updateBaseline = (key: string, patch: Partial<Baseline>) => {
    setBaselines((prev) => {
      const next = { ...prev, [key]: { ...(prev[key] || {}), ...patch } };
      saveBaselines(next);
      return next;
    });
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

  const states = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.state) set.add(r.state); });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stateFilter !== "all" && r.state !== stateFilter) return false;
      if (!q) return true;
      return [r.state, r.lga, r.ward, r.community, r.settlement].some((x) => (x || "").toLowerCase().includes(q));
    });
  }, [rows, search, stateFilter]);

  // Recommendation logic: median of {current, previous, worldpop, grid3} when
  // ≥3 values exist. If only current vs previous and YoY change >50%, cap
  // recommendation at previous × 1.10 (10% annual growth ceiling).
  const recommend = (r: RowData): { value: number; rationale: string; status: "ok" | "warn" | "alert" } => {
    const b = baselines[r.key] || {};
    const candidates: { label: string; value: number }[] = [];
    candidates.push({ label: `Current (${r.currentYear})`, value: r.current });
    if (r.previous != null) candidates.push({ label: `Previous (${r.previousYear})`, value: r.previous });
    if (b.worldpop) candidates.push({ label: "WorldPop", value: Number(b.worldpop) });
    if (b.grid3) candidates.push({ label: "GRID3", value: Number(b.grid3) });

    if (candidates.length >= 3) {
      const med = median(candidates.map((c) => c.value));
      const closest = candidates.reduce((a, c) => Math.abs(c.value - med) < Math.abs(a.value - med) ? c : a);
      const spread = Math.max(...candidates.map((c) => c.value)) / Math.max(1, Math.min(...candidates.map((c) => c.value)));
      const status: "ok" | "warn" | "alert" = spread > 2 ? "alert" : spread > 1.5 ? "warn" : "ok";
      return { value: med, rationale: `Median of ${candidates.length} sources (closest: ${closest.label}). Spread ×${spread.toFixed(2)}.`, status };
    }
    if (r.previous != null && r.pctChange != null && Math.abs(r.pctChange) > 50) {
      const cap = Math.round(r.previous * 1.10);
      return {
        value: cap,
        rationale: `Year-over-year change of ${r.pctChange.toFixed(0)}% is implausible. Capped at previous × 1.10. Add WorldPop & GRID3 baselines for a stronger recommendation.`,
        status: "alert",
      };
    }
    if (r.previous != null) {
      const avg = Math.round((r.current + r.previous) / 2);
      return { value: avg, rationale: `Average of current and previous year (no baselines provided).`, status: "warn" };
    }
    return { value: r.current, rationale: `Only one year of data — using current value. Add WorldPop / GRID3 for validation.`, status: "warn" };
  };

  const exportXlsx = () => {
    const data = filtered.map((r) => {
      const b = baselines[r.key] || {};
      const rec = recommend(r);
      return {
        State: r.state, LGA: r.lga, Ward: r.ward,
        Community: r.community, Settlement: r.settlement,
        [`Year ${r.currentYear} (Current)`]: r.current,
        [`Year ${r.previousYear ?? "—"} (Previous)`]: r.previous ?? "",
        "YoY % Change": r.pctChange != null ? r.pctChange.toFixed(1) + "%" : "",
        "WorldPop": b.worldpop ?? "",
        "GRID3": b.grid3 ?? "",
        "Recommended for Planning": rec.value,
        "Rationale": rec.rationale,
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
          </div>

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
