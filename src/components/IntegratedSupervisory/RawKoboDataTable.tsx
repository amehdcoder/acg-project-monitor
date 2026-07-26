import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft, ChevronRight, Columns3, Download, Eye, FileSpreadsheet, Filter, MapPin, Search,
} from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { KoboCache } from "./koboClient";
import { buildDataDictionary, typeIcon, type KoboColumn } from "./koboSchema";

const statusStyle = (s: string) => {
  const v = String(s || "").toLowerCase();
  if (["approved", "validated"].some((k) => v.includes(k))) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (["flagged", "rejected", "not_approved"].some((k) => v.includes(k))) return "bg-red-100 text-red-800 border-red-300";
  return "bg-yellow-100 text-yellow-800 border-yellow-300";
};
const submissionStatus = (r: any) => r?._validation_status?.label || r?._validation_status?.uid || "Pending";

function toCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export default function RawKoboDataTable({ cache }: { cache: KoboCache | null }) {
  const [search, setSearch] = useState("");
  const dq = useDebouncedValue(search, 300);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<any | null>(null);

  const columns = useMemo<KoboColumn[]>(
    () => cache?.columns ?? buildDataDictionary(cache?.flatResults ?? []),
    [cache],
  );
  const rows = cache?.flatResults ?? [];

  const [visibleCols, setVisibleCols] = useState<string[]>([]);
  useEffect(() => {
    // On first load pick a friendly default: submission time, submitter, then ~10 non-system fields.
    if (columns.length === 0 || visibleCols.length > 0) return;
    const preferred = ["_submission_time", "_submitted_by", "_validation_status"];
    const rest = columns.filter((c) => !c.system).slice(0, 10).map((c) => c.key);
    setVisibleCols([...preferred.filter((k) => columns.some((c) => c.key === k)), ...rest]);
  }, [columns, visibleCols.length]);

  const filtered = useMemo(() => {
    if (!dq.trim()) return rows;
    const q = dq.toLowerCase();
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [rows, dq]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const slice = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const download = (mime: string, ext: string, cols: string[]) => {
    const csv = toCSV(filtered, cols);
    const blob = new Blob([csv], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `kobo-submissions-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (!cache) {
    return <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">No data yet. Open <b>Kobo Sync</b> to link a form and run <b>Sync Now</b>.</CardContent></Card>;
  }

  const cellDisplay = (v: unknown) => {
    if (v == null) return "—";
    if (Array.isArray(v)) return v.map((x) => typeof x === "object" ? JSON.stringify(x) : String(x)).join(", ");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" /> Raw Kobo Data
            <Badge variant="outline">{filtered.length.toLocaleString()} rows</Badge>
            <Badge variant="outline">{columns.length} fields</Badge>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search all fields…" className="pl-8 h-9 w-64" />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline"><Columns3 className="h-4 w-4 mr-1" /> Columns ({visibleCols.length})</Button>
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
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => download("text/csv", "csv", columns.map((c) => c.key))}><Download className="h-4 w-4 mr-1" /> CSV (all fields)</Button>
            <Button size="sm" variant="outline" onClick={() => download("application/vnd.ms-excel", "xls", columns.map((c) => c.key))}><FileSpreadsheet className="h-4 w-4 mr-1" /> Excel</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[#F8F9FA] border-b border-[#DADCE0] z-10">
              <tr>
                <th className="w-10 px-2 py-2"></th>
                <th className="text-left px-2 py-2 font-medium text-[#3C4043] whitespace-nowrap">Status</th>
                {visibleCols.map((k) => {
                  const c = columns.find((x) => x.key === k);
                  return (
                    <th key={k} className="text-left px-2 py-2 font-medium text-[#3C4043] whitespace-nowrap">
                      <span className="font-mono text-[10px] font-bold text-muted-foreground mr-1">{c ? typeIcon(c.type) : "ABC"}</span>
                      {c?.label ?? k}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {slice.map((r, i) => {
                const st = submissionStatus(r);
                return (
                  <tr key={String(r._id ?? i)} className="border-b border-[#F1F3F4] hover:bg-muted/40">
                    <td className="px-2 py-1.5"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetail(r)}><Eye className="h-4 w-4" /></Button></td>
                    <td className="px-2 py-1.5"><Badge className={statusStyle(st)} variant="outline">{st}</Badge></td>
                    {visibleCols.map((k) => {
                      const val = cellDisplay(r[k]);
                      return <td key={k} className="px-2 py-1.5 max-w-[260px] truncate" title={val}>{val}</td>;
                    })}
                  </tr>
                );
              })}
              {slice.length === 0 && (
                <tr><td colSpan={visibleCols.length + 2} className="text-center text-sm text-muted-foreground py-8">No matching submissions.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between p-3 border-t text-xs text-muted-foreground">
          <span>Page {safePage + 1} of {totalPages} · showing {slice.length} of {filtered.length.toLocaleString()}</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setPage(0)} disabled={safePage === 0}>« First</Button>
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}><ChevronLeft className="h-4 w-4" /></Button>
            <Input type="number" min={1} max={totalPages} value={safePage + 1} onChange={(e) => setPage(Math.max(0, Math.min(totalPages - 1, Number(e.target.value) - 1)))} className="w-16 h-8 text-center" />
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1}>Last »</Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">Submission {detail?._id ?? ""} <Badge className={statusStyle(submissionStatus(detail))} variant="outline">{submissionStatus(detail)}</Badge></DialogTitle>
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
    </Card>
  );
}
