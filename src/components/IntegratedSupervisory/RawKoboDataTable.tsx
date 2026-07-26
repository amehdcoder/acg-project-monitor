import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Download, Eye, FileSpreadsheet, Filter, MapPin, Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { KoboCache } from "./koboClient";

const statusStyle = (s: string) => {
  const v = String(s || "").toLowerCase();
  if (["approved", "validated"].some(k => v.includes(k))) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (["flagged", "rejected", "not_approved"].some(k => v.includes(k))) return "bg-red-100 text-red-800 border-red-300";
  return "bg-yellow-100 text-yellow-800 border-yellow-300";
};

const submissionStatus = (r: any) => r?._validation_status?.label || r?._validation_status?.uid || "Pending";

const flattenRow = (r: any): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(r || {})) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object") out[k] = JSON.stringify(v);
    else out[k] = v;
  }
  return out;
};

function toCSV(rows: any[], headers: string[]): string {
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
}

export default function RawKoboDataTable({ cache }: { cache: KoboCache | null }) {
  const [search, setSearch] = useState("");
  const dq = useDebouncedValue(search, 300);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<any | null>(null);

  const rows = cache?.results ?? [];
  const filtered = useMemo(() => {
    if (!dq.trim()) return rows;
    const q = dq.toLowerCase();
    return rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  }, [rows, dq]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const slice = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows.slice(0, 50)) Object.keys(flattenRow(r)).forEach(k => keys.add(k));
    // Prefer meaningful columns first
    const preferred = ["_id", "_submission_time", "_submitted_by", "_validation_status"];
    return [...preferred.filter(k => keys.has(k)), ...[...keys].filter(k => !preferred.includes(k) && !k.startsWith("_")).slice(0, 8)];
  }, [rows]);

  const download = (mime: string, ext: string) => {
    const flat = filtered.map(flattenRow);
    const headers = Array.from(new Set(flat.flatMap(r => Object.keys(r))));
    const csv = toCSV(flat, headers);
    const blob = new Blob([csv], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `kobo-submissions-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (!cache) {
    return (
      <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">No data yet. Open <b>Kobo Sync</b> to link a form and run <b>Sync Now</b>.</CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /> Raw Kobo Data <Badge variant="outline">{filtered.length.toLocaleString()} rows</Badge></CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search all fields…" className="pl-8 h-9 w-64" />
            </div>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => download("text/csv", "csv")}><Download className="h-4 w-4 mr-1" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={() => download("application/vnd.ms-excel", "xls")}><FileSpreadsheet className="h-4 w-4 mr-1" /> Excel</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Status</TableHead>
                {columns.map(c => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {slice.map((r, i) => {
                const flat = flattenRow(r);
                const st = submissionStatus(r);
                return (
                  <TableRow key={r._id ?? i} className="hover:bg-muted/40">
                    <TableCell><Button size="icon" variant="ghost" onClick={() => setDetail(r)}><Eye className="h-4 w-4" /></Button></TableCell>
                    <TableCell><Badge className={statusStyle(st)} variant="outline">{st}</Badge></TableCell>
                    {columns.map(c => (
                      <TableCell key={c} className="text-xs max-w-[220px] truncate" title={String(flat[c] ?? "")}>{String(flat[c] ?? "—")}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
              {slice.length === 0 && (
                <TableRow><TableCell colSpan={columns.length + 2} className="text-center text-sm text-muted-foreground py-8">No matching submissions.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between p-3 border-t text-xs text-muted-foreground">
          <span>Page {safePage + 1} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setPage(0)} disabled={safePage === 0}>« First</Button>
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}><ChevronLeft className="h-4 w-4" /></Button>
            <Input type="number" min={1} max={totalPages} value={safePage + 1} onChange={e => setPage(Math.max(0, Math.min(totalPages - 1, Number(e.target.value) - 1)))} className="w-16 h-8 text-center" />
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1}>Last »</Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={!!detail} onOpenChange={o => !o && setDetail(null)}>
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
