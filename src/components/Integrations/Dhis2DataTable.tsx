import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, Download, FileSpreadsheet, Loader2, Search, Table2, X } from "lucide-react";
import { DashItem, VizResult, loadViz } from "./Dhis2DashboardItem";
import { dataDims, dimLabel, fmt, nameOf } from "./dhis2Pivot";

const ALL = "__all__";
const PAGE = 100;

export default function Dhis2DataTable({ connId, items }: { connId: string; items: DashItem[] }) {
  const sources = useMemo(() => items.filter((i) => i.ref && i.type !== "TEXT"), [items]);
  const [sel, setSel] = useState("");
  const [r, setR] = useState<VizResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => { if (!sources.find((s) => s.id === sel)) setSel(sources[0]?.id ?? ""); }, [sources, sel]);
  useEffect(() => {
    const it = sources.find((s) => s.id === sel);
    setR(null); setErr(null); setFilters({}); setSort(null); setQ(""); setLimit(PAGE);
    if (!it) return;
    let live = true; setLoading(true);
    loadViz(connId, it).then((x) => live && setR(x)).catch((e) => live && setErr(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [sel, connId, sources]);

  const a = r?.analytics ?? null;
  const dims = useMemo(() => (a ? dataDims(a) : []), [a]);
  const headers = useMemo(() => (a ? [...dims.map((d) => dimLabel(a, d)), "Value"] : []), [a, dims]);
  const allRows = useMemo(() => {
    if (!a) return [] as { ids: string[]; cells: (string | number)[] }[];
    const idx = dims.map((d) => a.headers.findIndex((h) => h.name === d));
    const vi = a.headers.findIndex((h) => h.name === "value");
    return a.rows.map((row) => {
      const ids = idx.map((i) => row[i]);
      const v = Number(row[vi]);
      return { ids, cells: [...ids.map((id) => nameOf(a, id)), Number.isFinite(v) ? v : row[vi] ?? ""] };
    });
  }, [a, dims]);
  const options = useMemo(() => dims.map((_, di) => {
    const m = new Map<string, string>();
    allRows.forEach((row) => m.set(row.ids[di], String(row.cells[di])));
    return [...m.entries()].sort((x, y) => x[1].localeCompare(y[1]));
  }), [dims, allRows]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let out = allRows.filter((row) => dims.every((d, i) => !filters[d] || filters[d] === ALL || row.ids[i] === filters[d])
      && (!term || row.cells.some((c) => String(c).toLowerCase().includes(term))));
    if (sort) out = [...out].sort((x, y) => {
      const A = x.cells[sort.col], B = y.cells[sort.col];
      return (typeof A === "number" && typeof B === "number" ? A - B : String(A).localeCompare(String(B), undefined, { numeric: true })) * sort.dir;
    });
    return out;
  }, [allRows, dims, filters, q, sort]);
  const total = rows.reduce((s, row) => s + (typeof row.cells.at(-1) === "number" ? (row.cells.at(-1) as number) : 0), 0);
  const active = Object.values(filters).filter((v) => v && v !== ALL).length + (q ? 1 : 0);
  const name = r?.viz.name ?? "dhis2-data";

  const exportCsv = () => {
    const csv = [headers, ...rows.map((row) => row.cells)].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `${name}.csv` }).click();
    URL.revokeObjectURL(url);
  };
  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows.map((row) => row.cells)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `${name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80)}.xlsx`);
  };

  return (
    <section className="mt-4 rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
        <Table2 className="h-4 w-4 text-primary" strokeWidth={1.75} />
        <h3 className="text-sm font-semibold text-foreground">DHIS2 Data Table</h3>
        <span className="text-xs text-muted-foreground hidden md:inline">Full rows and columns for any dataset on this dashboard</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={sel} onValueChange={setSel}>
            <SelectTrigger className="h-8 w-[280px] text-xs"><SelectValue placeholder="Select a dataset" /></SelectTrigger>
            <SelectContent>{sources.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.ref!.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={!rows.length} onClick={exportCsv}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
          <Button size="sm" variant="outline" disabled={!rows.length} onClick={exportXlsx}><FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Excel</Button>
        </div>
      </div>

      {!sources.length ? <p className="p-4 text-xs text-muted-foreground">This dashboard has no datasets to show.</p>
        : loading ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : err ? <p className="p-4 text-xs text-destructive">{err}</p>
        : !a ? <p className="p-4 text-xs text-muted-foreground">{r?.note ?? "This item has no tabular data."}</p>
        : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2">
              <div className="relative w-56">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search all columns" className="h-8 pl-7 text-xs" />
              </div>
              {dims.map((d, i) => (
                <Select key={d} value={filters[d] ?? ALL} onValueChange={(v) => { setFilters((f) => ({ ...f, [d]: v })); setLimit(PAGE); }}>
                  <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL} className="text-xs">All {dimLabel(a, d)}</SelectItem>
                    {options[i].map(([id, label]) => <SelectItem key={id} value={id} className="text-xs">{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ))}
              {active > 0 && <Button size="sm" variant="ghost" onClick={() => { setFilters({}); setQ(""); }}><X className="h-3.5 w-3.5 mr-1" />Clear</Button>}
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{rows.length.toLocaleString()} of {allRows.length.toLocaleString()} rows · Total <span className="font-mono font-semibold text-foreground">{fmt(total)}</span></span>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-10">#</th>
                    {headers.map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-foreground whitespace-nowrap ${i === headers.length - 1 ? "text-right" : "text-left"}`}>
                        <button type="button" className="inline-flex items-center gap-1 hover:text-primary"
                          onClick={() => setSort((s) => s?.col === i ? (s.dir === 1 ? { col: i, dir: -1 } : null) : { col: i, dir: 1 })}>
                          {h}{sort?.col === i && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((row, i) => (
                    <tr key={i} className="border-t border-border/50 hover:bg-primary/5">
                      <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                      {row.cells.map((c, j) => (
                        <td key={j} className={`px-3 py-1.5 ${j === row.cells.length - 1 ? "text-right font-mono tabular-nums font-medium" : "text-foreground"}`}>
                          {typeof c === "number" ? fmt(c) : c}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={headers.length + 1} className="px-3 py-6 text-center text-muted-foreground">No rows match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            {rows.length > limit && (
              <div className="border-t border-border/60 px-4 py-2 text-center">
                <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE * 5)}>Show more ({(rows.length - limit).toLocaleString()} remaining)</Button>
              </div>
            )}
          </>
        )}
    </section>
  );
}
