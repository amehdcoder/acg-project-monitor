import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Columns3, Database, Download, FileSpreadsheet, Layers, Search, WrapText,
} from "lucide-react";
import { useChecklistPermissions } from "@/hooks/useChecklistPermissions";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { KoboCache } from "./koboClient";
import {
  buildChecklistDataset, displayCell, FLAT_COLUMNS, RAW_COLUMNS, type GridColumn,
} from "./checklistSchema";
import { exportCsv, exportXlsx } from "./exportKoboData";

type ViewMode = "flat" | "raw";

const uniqVals = (rows: Record<string, unknown>[], key: string) =>
  Array.from(new Set(rows.map((r) => String(r[key] ?? "")).filter(Boolean))).sort();

const FilterSelect = ({
  label, value, onChange, options, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40 h-9"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="__all">{placeholder}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

export default function ChecklistDataTable({ cache }: { cache: KoboCache | null }) {
  const { canExport } = useChecklistPermissions();
  const [mode, setMode] = useState<ViewMode>("flat");
  const [search, setSearch] = useState("");
  const dq = useDebouncedValue(search, 300);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [wrap, setWrap] = useState(true);
  const [fState, setFState] = useState("__all");
  const [fLga, setFLga] = useState("__all");
  const [fStatus, setFStatus] = useState("__all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { parents, respondents } = useMemo(
    () => buildChecklistDataset(cache?.results ?? []),
    [cache],
  );

  const columns: GridColumn[] = mode === "flat" ? FLAT_COLUMNS : RAW_COLUMNS;
  const rows = mode === "flat" ? respondents : parents;

  const [hidden, setHidden] = useState<Record<ViewMode, string[]>>({ flat: [], raw: [] });
  const visibleColumns = useMemo(
    () => columns.filter((c) => !hidden[mode].includes(c.key)),
    [columns, hidden, mode],
  );

  useEffect(() => { setPage(0); }, [mode, dq, fState, fLga, fStatus, from, to]);

  const stateOpts = useMemo(() => uniqVals(rows, "State"), [rows]);
  const lgaOpts = useMemo(() => uniqVals(rows, "LGA"), [rows]);
  const statusOpts = useMemo(() => uniqVals(rows, "Status_of_MDA"), [rows]);

  const filtered = useMemo(() => {
    const q = dq.trim().toLowerCase();
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() + 86_400_000 : null;
    return rows.filter((r) => {
      if (fState !== "__all" && String(r.State ?? "") !== fState) return false;
      if (fLga !== "__all" && String(r.LGA ?? "") !== fLga) return false;
      if (fStatus !== "__all" && String(r.Status_of_MDA ?? "") !== fStatus) return false;
      if (fromTs || toTs) {
        const t = new Date(String(r._submission_time ?? "")).getTime();
        if (!Number.isFinite(t)) return false;
        if (fromTs && t < fromTs) return false;
        if (toTs && t >= toTs) return false;
      }
      if (q) {
        const hay = visibleColumns.map((c) => displayCell(c, r)).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, dq, fState, fLga, fStatus, from, to, visibleColumns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const slice = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const exportRows = useMemo(
    () => filtered.map((r) => {
      const o: Record<string, unknown> = {};
      for (const c of visibleColumns) o[c.key] = displayCell(c, r) === "—" ? "" : displayCell(c, r);
      return o;
    }),
    [filtered, visibleColumns],
  );
  const exportCols = visibleColumns.map((c) => ({ key: c.key, label: c.label }));
  const stamp = new Date().toISOString().slice(0, 10);
  const base = mode === "flat" ? "Supervisory_Checklist_Flattened" : "Supervisory_Checklist_Raw";

  return (
    <div className="rounded-xl overflow-hidden shadow-lg bg-muted/40 border">
      <div className="bg-gradient-to-r from-[hsl(214,60%,18%)] to-[hsl(214,60%,28%)] text-white px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-lg bg-white/10 flex items-center justify-center"><Database className="h-6 w-6" /></div>
          <div>
            <div className="text-lg font-bold tracking-tight">Raw Kobo Data</div>
            <div className="text-xs text-white/70">Integrated MDA Supervisory Checklist · exact XLSForm question order</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-white/25">
            <button
              onClick={() => setMode("flat")}
              className={`px-3 h-9 text-xs font-semibold flex items-center gap-1.5 ${mode === "flat" ? "bg-white text-slate-900" : "text-white/85 hover:bg-white/10"}`}
            ><Layers className="h-3.5 w-3.5" /> Flattened View</button>
            <button
              onClick={() => setMode("raw")}
              className={`px-3 h-9 text-xs font-semibold ${mode === "raw" ? "bg-white text-slate-900" : "text-white/85 hover:bg-white/10"}`}
            >Raw Submission View</button>
          </div>
          {canExport && <><Button className="h-9 bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => exportXlsx(exportRows, exportCols, null, `${base}_${stamp}.xlsx`)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
          </Button>
          <Button className="h-9 bg-sky-500 hover:bg-sky-600 text-white" onClick={() => exportCsv(exportRows, exportCols, null, `${base}_${stamp}.csv`)}>
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button></>}
        </div>
      </div>

      {/* Controls */}
      <div className="p-3">
        <div className="bg-background rounded-lg p-3 shadow-sm flex flex-wrap items-end gap-3">
          <FilterSelect label="State" value={fState} onChange={setFState} options={stateOpts} placeholder="All States" />
          <FilterSelect label="LGA" value={fLga} onChange={setFLga} options={lgaOpts} placeholder="All LGAs" />
          <FilterSelect label="MDA Status" value={fStatus} onChange={setFStatus} options={statusOpts} placeholder="All Statuses" />
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-36" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[11px] font-medium text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all fields..." className="pl-8 h-9" />
            </div>
          </div>
          <Button
            variant={wrap ? "default" : "outline"}
            className="h-9"
            onClick={() => setWrap((w) => !w)}
            title={wrap ? "Text wraps so every value is fully visible" : "Text is truncated to one line"}
          >
            <WrapText className="h-4 w-4 mr-1.5" /> {wrap ? "Wrap on" : "Wrap off"}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9"><Columns3 className="h-4 w-4 mr-1.5" /> Columns</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 max-h-[420px] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">Visible columns</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setHidden((h) => ({ ...h, [mode]: [] }))}>All</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setHidden((h) => ({ ...h, [mode]: columns.slice(5).map((c) => c.key) }))}>Minimal</Button>
                </div>
              </div>
              <div className="space-y-1">
                {columns.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-xs hover:bg-muted/50 rounded px-1 py-0.5 cursor-pointer">
                    <Checkbox
                      checked={!hidden[mode].includes(c.key)}
                      onCheckedChange={(v) => setHidden((h) => ({
                        ...h,
                        [mode]: v ? h[mode].filter((k) => k !== c.key) : [...h[mode], c.key],
                      }))}
                    />
                    <span className="truncate" title={`${c.section} · ${c.label}`}>{c.label}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="px-3 pb-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{filtered.length.toLocaleString()} rows</Badge>
        <Badge variant="outline">{visibleColumns.length} columns</Badge>
        {mode === "flat" && <Badge variant="outline">{respondents.length.toLocaleString()} respondent records from {parents.length.toLocaleString()} submissions</Badge>}
      </div>

      {/* Grid */}
      <div className="px-3 pb-3">
        <div className="bg-background rounded-lg border overflow-auto max-h-[70vh]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[hsl(214,60%,18%)] text-white">
                {visibleColumns.map((c) => (
                  <th key={c.key} className="text-left px-3 py-2 font-semibold whitespace-nowrap border-r border-white/10 min-w-[150px] align-bottom" title={c.section}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr><td colSpan={Math.max(1, visibleColumns.length)} className="px-4 py-10 text-center text-muted-foreground">No records match the current filters.</td></tr>
              ) : slice.map((r, i) => (
                <tr key={i} className={i % 2 ? "bg-muted/30" : ""}>
                  {visibleColumns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-1.5 border-t align-top min-w-[150px] ${wrap ? "whitespace-normal break-words max-w-[320px]" : "whitespace-nowrap max-w-[280px] truncate"}`}
                      title={displayCell(c, r)}
                    >
                      {displayCell(c, r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="px-3 pb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
            <SelectContent>{[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span>Page {safePage + 1} of {totalPages}</span>
          <Button size="sm" variant="outline" className="h-8" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
