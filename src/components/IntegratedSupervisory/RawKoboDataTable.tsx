import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Camera, CheckCircle2, ChevronLeft, ChevronRight, Columns3, Database, Download, Eye,
  FileSpreadsheet, Filter, Grid3x3, Lightbulb, MapPin, MoreVertical, RefreshCw, Search, Star, Users,
} from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { validateCache, type KoboCache } from "./koboClient";
import { buildDataDictionary, typeIcon, type KoboColumn } from "./koboSchema";


type StatusKey = "approved" | "flagged" | "pending";

const classifyStatus = (raw: string): StatusKey => {
  const v = String(raw || "").toLowerCase();
  if (/(approv|validat)/.test(v)) return "approved";
  if (/(flag|reject|not_approved)/.test(v)) return "flagged";
  return "pending";
};

const statusPill = (raw: string) => {
  const k = classifyStatus(raw);
  const label = k === "approved" ? "Approved" : k === "flagged" ? "Flagged" : "Pending";
  const cls = k === "approved"
    ? "bg-emerald-500 text-white"
    : k === "flagged"
      ? "bg-rose-500 text-white"
      : "bg-amber-400 text-amber-950";
  return <span className={`inline-flex items-center justify-center px-3 py-1 rounded-md text-[11px] font-semibold min-w-[78px] ${cls}`}>{label}</span>;
};

const submissionStatus = (r: any) => r?._validation_status?.label || r?._validation_status?.uid || "Pending";
const hasGps = (r: any) => Array.isArray(r?._geolocation) && r._geolocation[0] != null && r._geolocation[1] != null;
const hasPhotos = (r: any) => Array.isArray(r?._attachments) && r._attachments.some((a: any) => String(a?.mimetype || "").startsWith("image/"));

function toCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

const qualityBadge = (score: number | null) => {
  if (score == null) return <span className="text-slate-400 text-xs">—</span>;
  const pct = Math.round(score);
  const cls = pct >= 90
    ? "bg-emerald-100 text-emerald-700 border-emerald-300"
    : pct >= 75
      ? "bg-lime-100 text-lime-700 border-lime-300"
      : pct >= 50
        ? "bg-amber-100 text-amber-800 border-amber-300"
        : "bg-rose-100 text-rose-700 border-rose-300";
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{pct}%</span>;
};

const rowQuality = (r: any, columns: KoboColumn[]) => {
  const fields = columns.filter((c) => !c.system);
  if (fields.length === 0) return null;
  const filled = fields.filter((c) => {
    const v = r[c.key];
    return v != null && String(v).trim() !== "" && !(Array.isArray(v) && v.length === 0);
  }).length;
  return (filled / fields.length) * 100;
};

const uniq = (vals: unknown[]) =>
  Array.from(new Set(vals.map((v) => (v == null ? "" : String(v))).filter(Boolean))).sort();

const KpiCard = ({
  icon, iconBg, iconColor, label, value, sub, subColor,
}: { icon: React.ReactNode; iconBg: string; iconColor: string; label: string; value: string; sub?: string; subColor?: string }) => (
  <div className="bg-white rounded-lg px-4 py-3 flex items-center gap-3 shadow-sm">
    <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${iconBg} ${iconColor}`}>{icon}</div>
    <div className="min-w-0">
      <div className="text-[11px] text-slate-500 font-medium leading-tight">{label}</div>
      <div className="text-xl font-bold text-slate-800 leading-tight">{value}</div>
      {sub && <div className={`text-[11px] font-semibold ${subColor ?? "text-slate-500"}`}>{sub}</div>}
    </div>
  </div>
);

export default function RawKoboDataTable({ cache, onRefresh }: { cache: KoboCache | null; onRefresh?: () => void }) {
  const [search, setSearch] = useState("");
  const dq = useDebouncedValue(search, 300);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<any | null>(null);

  const [fState, setFState] = useState<string>("__all");
  const [fLga, setFLga] = useState<string>("__all");
  const [fWard, setFWard] = useState<string>("__all");
  const [fTeam, setFTeam] = useState<string>("__all");
  const [fStatus, setFStatus] = useState<string>("__all");

  const columns = useMemo<KoboColumn[]>(
    () => cache?.columns ?? buildDataDictionary(cache?.flatResults ?? []),
    [cache],
  );
  const rows = cache?.flatResults ?? [];

  // Detect geo columns dynamically
  const geoKey = (name: string) =>
    columns.find((c) => c.key.toLowerCase().endsWith(name) || c.label.toLowerCase() === name)?.key;
  const stateKey = geoKey("state");
  const lgaKey = geoKey("lga");
  const wardKey = geoKey("ward");
  const teamKey =
    columns.find((c) => /team|supervisor/i.test(c.key) || /team|supervisor/i.test(c.label))?.key;

  const stateOpts = useMemo(() => (stateKey ? uniq(rows.map((r) => r[stateKey])) : []), [rows, stateKey]);
  const lgaOpts = useMemo(() => (lgaKey ? uniq(rows.map((r) => r[lgaKey])) : []), [rows, lgaKey]);
  const wardOpts = useMemo(() => (wardKey ? uniq(rows.map((r) => r[wardKey])) : []), [rows, wardKey]);
  const teamOpts = useMemo(() => (teamKey ? uniq(rows.map((r) => r[teamKey])) : []), [rows, teamKey]);

  const [visibleCols, setVisibleCols] = useState<string[]>([]);
  useEffect(() => {
    if (columns.length === 0 || visibleCols.length > 0) return;
    const preferred = ["_submission_time"];
    const rest = columns.filter((c) => !c.system).slice(0, 8).map((c) => c.key);
    setVisibleCols([...preferred.filter((k) => columns.some((c) => c.key === k)), ...rest]);
  }, [columns, visibleCols.length]);

  const filtered = useMemo(() => {
    const q = dq.trim().toLowerCase();
    return rows.filter((r) => {
      if (stateKey && fState !== "__all" && String(r[stateKey] ?? "") !== fState) return false;
      if (lgaKey && fLga !== "__all" && String(r[lgaKey] ?? "") !== fLga) return false;
      if (wardKey && fWard !== "__all" && String(r[wardKey] ?? "") !== fWard) return false;
      if (teamKey && fTeam !== "__all" && String(r[teamKey] ?? "") !== fTeam) return false;
      if (fStatus !== "__all" && classifyStatus(submissionStatus(r)) !== fStatus) return false;
      if (q && !JSON.stringify(r).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, dq, fState, fLga, fWard, fTeam, fStatus, stateKey, lgaKey, wardKey, teamKey]);

  // KPIs based on filtered
  const kpis = useMemo(() => {
    const total = filtered.length;
    let approved = 0, pending = 0, flagged = 0, withGps = 0, withPhotos = 0, qSum = 0, qCount = 0;
    for (const r of filtered) {
      const s = classifyStatus(submissionStatus(r));
      if (s === "approved") approved++;
      else if (s === "flagged") flagged++;
      else pending++;
      if (hasGps(r)) withGps++;
      if (hasPhotos(r)) withPhotos++;
      const q = rowQuality(r, columns);
      if (q != null) { qSum += q; qCount++; }
    }
    const pct = (n: number) => (total ? (n / total) * 100 : 0);
    return {
      total, approved, pending, flagged, withGps, withPhotos,
      approvedPct: pct(approved), pendingPct: pct(pending), flaggedPct: pct(flagged),
      gpsPct: pct(withGps), photoPct: pct(withPhotos),
      avgQuality: qCount ? qSum / qCount : 0,
    };
  }, [filtered, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const slice = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const validation = useMemo(() => cache?.validation ?? validateCache(cache), [cache]);

  const download = (mime: string, ext: string, cols: string[]) => {
    if (validation && !validation.ok) {
      toast.error("Export blocked", { description: validation.errors[0]?.message ?? "Schema validation failed. Re-sync from Kobo Sync." });
      return;
    }
    if (validation && validation.warnings.length > 0) {
      toast.warning(`Exporting with ${validation.warnings.length} schema warning${validation.warnings.length === 1 ? "" : "s"}`, {
        description: validation.warnings[0]?.message,
      });
    }
    const csv = toCSV(filtered, cols);
    const blob = new Blob([csv], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `kobo-submissions-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click(); URL.revokeObjectURL(url);
  };


  const cellDisplay = (v: unknown) => {
    if (v == null) return "—";
    if (Array.isArray(v)) return v.map((x) => typeof x === "object" ? JSON.stringify(x) : String(x)).join(", ");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  const fmtInt = (n: number) => n.toLocaleString();
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const lastSync = cache?.fetchedAt ? new Date(cache.fetchedAt) : null;
  const lastSyncStr = lastSync
    ? lastSync.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

  // Pagination buttons
  const pageNumbers = useMemo(() => {
    const arr: (number | "…")[] = [];
    const push = (n: number) => arr.push(n);
    const last = totalPages;
    if (last <= 7) { for (let i = 1; i <= last; i++) push(i); }
    else {
      push(1); push(2); push(3); push(4);
      if (safePage + 1 > 4 && safePage + 1 < last - 1) { push("…" as any); push(safePage + 1); }
      arr.push("…" as any);
      push(last);
    }
    return arr;
  }, [totalPages, safePage]);

  return (
    <div className="rounded-xl overflow-hidden shadow-lg bg-[#EAEEF3]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0B1E3F] to-[#12315F] text-white px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-lg bg-white/10 flex items-center justify-center">
            <Database className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight">Kobo Data Explorer</div>
            <div className="text-xs text-blue-100/80">MDA Supervisory Data Overview</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onRefresh} className="bg-blue-500 hover:bg-blue-600 text-white h-9"><RefreshCw className="h-4 w-4 mr-2" /> Refresh Data</Button>
          <Button onClick={() => download("application/vnd.ms-excel", "xls", columns.map((c) => c.key))} className="bg-emerald-500 hover:bg-emerald-600 text-white h-9"><FileSpreadsheet className="h-4 w-4 mr-2" /> Export Excel</Button>
          <Button onClick={() => download("text/csv", "csv", columns.map((c) => c.key))} className="bg-sky-500 hover:bg-sky-600 text-white h-9"><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
          <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 h-9 w-9"><MoreVertical className="h-5 w-5" /></Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="px-4 pt-4 pb-2 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <KpiCard icon={<Grid3x3 className="h-5 w-5" />} iconBg="bg-blue-100" iconColor="text-blue-600" label="Total Submissions" value={fmtInt(kpis.total)} sub="All time" subColor="text-slate-400" />
        <KpiCard icon={<Users className="h-5 w-5" />} iconBg="bg-emerald-100" iconColor="text-emerald-600" label="Approved" value={fmtInt(kpis.approved)} sub={fmtPct(kpis.approvedPct)} subColor="text-emerald-600" />
        <KpiCard icon={<CheckCircle2 className="h-5 w-5" />} iconBg="bg-amber-100" iconColor="text-amber-600" label="Pending" value={fmtInt(kpis.pending)} sub={fmtPct(kpis.pendingPct)} subColor="text-amber-600" />
        <KpiCard icon={<Users className="h-5 w-5" />} iconBg="bg-rose-100" iconColor="text-rose-600" label="Flagged" value={fmtInt(kpis.flagged)} sub={fmtPct(kpis.flaggedPct)} subColor="text-rose-600" />
        <KpiCard icon={<MapPin className="h-5 w-5" />} iconBg="bg-sky-100" iconColor="text-sky-600" label="With GPS" value={fmtInt(kpis.withGps)} sub={fmtPct(kpis.gpsPct)} subColor="text-sky-600" />
        <KpiCard icon={<Camera className="h-5 w-5" />} iconBg="bg-violet-100" iconColor="text-violet-600" label="With Photos" value={fmtInt(kpis.withPhotos)} sub={fmtPct(kpis.photoPct)} subColor="text-violet-600" />
        <KpiCard icon={<Star className="h-5 w-5" />} iconBg="bg-emerald-100" iconColor="text-emerald-600" label="Avg. Data Quality" value={`${kpis.avgQuality.toFixed(1)}%`} sub={kpis.avgQuality >= 90 ? "Excellent" : kpis.avgQuality >= 75 ? "Good" : kpis.avgQuality >= 50 ? "Fair" : "Poor"} subColor="text-emerald-600" />
        <div className="bg-white rounded-lg px-4 py-3 shadow-sm">
          <div className="text-[11px] text-slate-500 font-medium">Last Sync</div>
          <div className="text-sm font-bold text-slate-800 leading-tight mt-0.5">{lastSyncStr}</div>
          <div className="flex items-center gap-1.5 mt-1"><span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /><span className="text-[11px] font-semibold text-emerald-600">Live</span></div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 pb-3">
        <div className="bg-white rounded-lg p-3 shadow-sm flex flex-wrap items-end gap-3">
          <FilterSelect label="State" value={fState} onChange={(v) => { setFState(v); setPage(0); }} options={stateOpts} placeholder="All States" />
          <FilterSelect label="LGA" value={fLga} onChange={(v) => { setFLga(v); setPage(0); }} options={lgaOpts} placeholder="All LGAs" />
          <FilterSelect label="Ward" value={fWard} onChange={(v) => { setFWard(v); setPage(0); }} options={wardOpts} placeholder="All Wards" />
          <FilterSelect label="Supervisor / Team" value={fTeam} onChange={(v) => { setFTeam(v); setPage(0); }} options={teamOpts} placeholder="All Teams" />
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-500">Status</label>
            <Select value={fStatus} onValueChange={(v) => { setFStatus(v); setPage(0); }}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All Statuses</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <label className="text-[11px] font-medium text-slate-500 opacity-0">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search all columns..." className="pl-8 h-9" />
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9"><Columns3 className="h-4 w-4 mr-1.5" /> Filters</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 max-h-[400px] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">Show columns</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setVisibleCols(columns.map((c) => c.key))}>All</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setVisibleCols([])}>None</Button>
                </div>
              </div>
              <div className="space-y-1">
                {columns.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-xs hover:bg-muted/50 rounded px-1 py-0.5 cursor-pointer">
                    <Checkbox
                      checked={visibleCols.includes(c.key)}
                      onCheckedChange={(v) => setVisibleCols((prev) => v ? [...prev, c.key] : prev.filter((x) => x !== c.key))}
                    />
                    <span className="font-mono text-[10px] font-bold text-muted-foreground w-6">{typeIcon(c.type)}</span>
                    <span className="truncate flex-1" title={c.path}>{c.label}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Table */}
      <div className="px-4">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-gradient-to-r from-[#12315F] to-[#1E4485] text-white">
                <tr>
                  <th className="w-10 px-2 py-3"></th>
                  <th className="w-16 px-2 py-3 text-left font-semibold whitespace-nowrap">Actions</th>
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">↕ Submission Time</th>
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Status</th>
                  <th className="w-10 px-2 py-3 text-center"><MapPin className="h-4 w-4 inline" /></th>
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Data Quality</th>
                  <th className="w-16 px-2 py-3 text-center font-semibold whitespace-nowrap">Photos</th>
                  {visibleCols
                    .filter((k) => k !== "_submission_time")
                    .map((k) => {
                      const c = columns.find((x) => x.key === k);
                      return (
                        <th key={k} className="text-left px-3 py-3 font-semibold whitespace-nowrap">
                          <span className="font-mono text-[10px] font-bold text-blue-100 mr-1">{c ? typeIcon(c.type) : "ABC"}</span>
                          {c?.label ?? k}
                        </th>
                      );
                    })}
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {slice.map((r, i) => {
                  const st = submissionStatus(r);
                  const q = rowQuality(r, columns);
                  const gps = hasGps(r);
                  const photo = hasPhotos(r);
                  const time = r._submission_time ? new Date(r._submission_time as any) : null;
                  const timeStr = time ? time.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
                  return (
                    <tr key={String(r._id ?? i)} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-2 py-2"><Checkbox /></td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:bg-blue-50" onClick={() => setDetail(r)}><Eye className="h-4 w-4" /></Button>
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{timeStr}</td>
                      <td className="px-3 py-2">{statusPill(st)}</td>
                      <td className="px-2 py-2 text-center">
                        {gps
                          ? <MapPin className="h-4 w-4 text-emerald-500 inline" />
                          : <MapPin className="h-4 w-4 text-slate-300 inline line-through" />}
                      </td>
                      <td className="px-3 py-2">{qualityBadge(q)}</td>
                      <td className="px-2 py-2 text-center">
                        {photo
                          ? <Camera className="h-4 w-4 text-emerald-500 inline" />
                          : <Camera className="h-4 w-4 text-rose-400 inline" />}
                      </td>
                      {visibleCols
                        .filter((k) => k !== "_submission_time")
                        .map((k) => {
                          const val = cellDisplay(r[k]);
                          return <td key={k} className="px-3 py-2 max-w-[240px] truncate" title={val}>{val}</td>;
                        })}
                    </tr>
                  );
                })}
                {slice.length === 0 && (
                  <tr><td colSpan={visibleCols.length + 6} className="text-center text-sm text-slate-500 py-10">No matching submissions.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer / pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
            <span>Showing {slice.length === 0 ? 0 : safePage * pageSize + 1} to {safePage * pageSize + slice.length} of {filtered.length.toLocaleString()} entries</span>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}><ChevronLeft className="h-4 w-4" /></Button>
              {pageNumbers.map((n, i) =>
                n === "…"
                  ? <span key={`e${i}`} className="px-2 text-slate-400">…</span>
                  : <Button key={n} size="sm" variant={n - 1 === safePage ? "default" : "outline"} className={`h-8 min-w-8 px-2 ${n - 1 === safePage ? "bg-blue-500 hover:bg-blue-600 text-white" : ""}`} onClick={() => setPage((n as number) - 1)}>{n}</Button>
              )}
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{[10, 25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Legend footer */}
      <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="font-semibold text-slate-700 mb-2">Status Legend</div>
          <div className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Approved</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Pending</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Flagged</span>
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="font-semibold text-slate-700 mb-2">Data Quality Guide</div>
          <div className="grid grid-cols-4 gap-1 text-[11px]">
            <div><div className="font-bold text-emerald-600">90-100%</div><div className="text-slate-400">Excellent</div></div>
            <div><div className="font-bold text-lime-600">75-89%</div><div className="text-slate-400">Good</div></div>
            <div><div className="font-bold text-amber-600">50-74%</div><div className="text-slate-400">Fair</div></div>
            <div><div className="font-bold text-rose-600">0-49%</div><div className="text-slate-400">Poor</div></div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="font-semibold text-slate-700 mb-2 flex items-center gap-1"><Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Quick Tips</div>
          <div className="text-slate-500 leading-relaxed">Click on <Eye className="h-3 w-3 inline text-blue-500" /> to view full submission details. Use filters to refine your search and export data for reporting.</div>
        </div>
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="font-semibold text-slate-700 mb-2">Data Source</div>
          <div className="flex items-center gap-1.5 text-slate-600 font-semibold"><Database className="h-3.5 w-3.5 text-blue-600" /> Kobo<span className="text-slate-400">Toolbox</span></div>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Last synced: {lastSyncStr}</div>
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">Submission {detail?._id ?? ""} {statusPill(submissionStatus(detail))}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              {(detail._geolocation?.[0] ?? detail?.geolocation?.[0]) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-4 w-4 text-emerald-600" />
                  GPS: {detail._geolocation?.[0] ?? detail?.geolocation?.[0]}, {detail._geolocation?.[1] ?? detail?.geolocation?.[1]}
                </div>
              )}
              {Array.isArray(detail._attachments) && detail._attachments.length > 0 && (
                <div>
                  <div className="text-xs font-semibold mb-1">Attachments ({detail._attachments.length})</div>
                  <div className="grid grid-cols-3 gap-2">
                    {detail._attachments.slice(0, 6).map((a: any, i: number) => (
                      <a key={i} href={a.download_url} target="_blank" rel="noreferrer" className="block border rounded overflow-hidden">
                        {String(a.mimetype || "").startsWith("image/")
                          ? <img src={a.download_url} alt={a.filename} className="w-full h-24 object-cover" />
                          : <div className="p-2 text-[10px] truncate">{a.filename}</div>}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <pre className="bg-muted/40 rounded p-3 text-[11px] overflow-x-auto max-h-96">{JSON.stringify(detail, null, 2)}</pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-slate-500">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-40 h-9"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">{placeholder}</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
