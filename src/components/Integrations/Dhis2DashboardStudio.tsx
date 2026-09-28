import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeftRight, Download, LayoutDashboard, Loader2, RefreshCw, Search, Star, X } from "lucide-react";
import { toast } from "sonner";
import { dhis2Call } from "./dhis2Api";
import Dhis2DashboardItem, { ChartBody, DashItem, PivotTable, VizResult, clearVizCache } from "./Dhis2DashboardItem";
import { dataDims, dimLabel, nameOf, pivot } from "./dhis2Pivot";

type DashMeta = { id: string; name: string; description: string | null; starred: boolean; items: number };
type Dash = { id: string; name: string; description: string | null; items: DashItem[] };

function PivotDialog({ r, onClose }: { r: VizResult | null; onClose: () => void }) {
  const a = r?.analytics ?? null;
  const dims = useMemo(() => (a ? dataDims(a) : []), [a]);
  const [rows, setRows] = useState<string[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  useEffect(() => {
    if (!r || !a) return;
    const valid = (l: { dimension: string }[]) => l.map((d) => d.dimension).filter((d) => dims.includes(d));
    const rr = valid(r.layout.rows); const cc = valid(r.layout.columns);
    setRows(rr.length ? rr : dims.filter((d) => !cc.includes(d)).slice(0, 1)); setCols(cc);
  }, [r, a, dims]);
  const move = (d: string, to: "rows" | "cols" | "off") => {
    setRows((l) => (to === "rows" ? [...l.filter((x) => x !== d), d] : l.filter((x) => x !== d)));
    setCols((l) => (to === "cols" ? [...l.filter((x) => x !== d), d] : l.filter((x) => x !== d)));
  };
  const exportCsv = () => {
    if (!a) return;
    const p = pivot(a, rows, cols);
    const head = [...rows.map((d) => dimLabel(a, d)), ...p.colKeys.map((k) => k.map((id) => nameOf(a, id)).join(" / ") || "Value"), "Total"];
    const body = p.rowKeys.map((rk) => [...rk.map((id) => nameOf(a, id)), ...p.colKeys.map((c) => p.cell(rk, c) ?? ""), p.rowTotal(rk)]);
    const csv = [head, ...body].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `${r?.viz.name ?? "pivot"}.csv` }).click();
    URL.revokeObjectURL(url);
  };
  const Chip = ({ d, zone }: { d: string; zone: "rows" | "cols" | "off" }) => (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs">
      {a && dimLabel(a, d)}
      {zone !== "rows" && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => move(d, "rows")} title="Move to rows">↓</button>}
      {zone !== "cols" && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => move(d, "cols")} title="Move to columns">→</button>}
      {zone !== "off" && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => move(d, "off")} title="Remove"><X className="h-3 w-3" /></button>}
    </span>
  );
  const off = dims.filter((d) => !rows.includes(d) && !cols.includes(d));
  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{r?.viz.name}</DialogTitle>
          <DialogDescription>Data pivot — move dimensions between rows and columns to re-shape the table. Totals update instantly.</DialogDescription>
        </DialogHeader>
        {a && (
          <>
            <div className="grid gap-2 sm:grid-cols-3 text-xs">
              {([["Columns", cols, "cols"], ["Rows", rows, "rows"], ["Available (summed)", off, "off"]] as const).map(([label, list, zone]) => (
                <div key={zone} className="rounded-md border border-dashed border-border bg-muted/40 p-2 min-h-[52px]">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                  <div className="flex flex-wrap gap-1">{list.map((d) => <Chip key={d} d={d} zone={zone} />)}</div>
                </div>
              ))}
            </div>
            {r!.layout.filters.length > 0 && <p className="text-[11px] text-muted-foreground">Filters: {r!.layout.filters.map((f) => `${dimLabel(a, f.dimension)}: ${f.items.map((i) => nameOf(a, i)).join(", ")}`).join(" · ")}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setRows(cols); setCols(rows); }}><ArrowLeftRight className="h-3.5 w-3.5 mr-1" />Swap</Button>
              <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5 mr-1" />Download CSV</Button>
            </div>
            <div className="flex-1 min-h-0 rounded-md border border-border"><PivotTable a={a} rowDims={rows} colDims={cols} /></div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Dhis2DashboardStudio({ open, onOpenChange, connId, connName, baseUrl }: { open: boolean; onOpenChange: (o: boolean) => void; connId: string; connName?: string; baseUrl?: string }) {
  const [list, setList] = useState<DashMeta[] | null>(null);
  const [dash, setDash] = useState<Dash | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [pivotOf, setPivotOf] = useState<VizResult | null>(null);
  const [expand, setExpand] = useState<VizResult | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open || !connId) return;
    setList(null);
    dhis2Call<{ dashboards: DashMeta[] }>({ action: "dash_list", connection_id: connId })
      .then((r) => { setList(r.dashboards); if (r.dashboards[0]) setSelected((s) => s || r.dashboards[0].id); })
      .catch((e) => { setList([]); toast.error(e.message); });
  }, [open, connId]);

  useEffect(() => {
    if (!open || !selected) return;
    setLoading(true); setDash(null);
    dhis2Call<{ dashboard: Dash }>({ action: "dash_get", connection_id: connId, dashboard_id: selected })
      .then((r) => setDash(r.dashboard)).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [open, selected, connId, nonce]);

  const shown = (list ?? []).filter((d) => d.name.toLowerCase().includes(q.toLowerCase()));
  const items = useMemo(() => [...(dash?.items ?? [])].sort((a, b) => a.y - b.y || a.x - b.x), [dash]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-[100dvh] p-0 gap-0 rounded-none flex flex-col [&>button]:text-primary-foreground [&>button]:top-3">
        <DialogTitle className="sr-only">DHIS2 dashboards</DialogTitle>
        <DialogDescription className="sr-only">Exact replica of the connected DHIS2 dashboards</DialogDescription>
        <header className="flex items-center gap-3 bg-primary text-primary-foreground px-4 h-12 shrink-0">
          <LayoutDashboard className="h-5 w-5" strokeWidth={1.5} />
          <span className="font-semibold tracking-tight">DHIS2 Dashboards</span>
          <span className="text-xs opacity-75 truncate hidden sm:inline">{connName}{baseUrl ? ` · ${baseUrl}` : ""}</span>
        </header>
        <div className="border-b border-border bg-card px-3 py-2 flex items-center gap-2 shrink-0">
          <div className="relative w-44 shrink-0">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dashboards" className="h-8 pl-7 text-xs" />
          </div>
          <div className="flex-1 flex gap-1.5 overflow-x-auto py-0.5">
            {list === null ? <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Loading dashboards…</span>
              : !shown.length ? <span className="text-xs text-muted-foreground">No dashboards available to this DHIS2 account.</span>
              : shown.map((d) => (
                <button key={d.id} type="button" onClick={() => setSelected(d.id)}
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-colors ${selected === d.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent"}`}>
                  {d.starred && <Star className="h-3 w-3 fill-current" />}{d.name}
                </button>))}
          </div>
        </div>
        <main className="flex-1 overflow-auto bg-muted/50 p-3 sm:p-4">
          {dash && (
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{dash.name}</h2>
                {dash.description && <p className="text-xs text-muted-foreground">{dash.description}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={() => { clearVizCache(); setNonce((n) => n + 1); }}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
            </div>
          )}
          {loading ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            : dash && !items.length ? <p className="text-sm text-muted-foreground">This dashboard has no items.</p>
            : dash && (
              <div className="flex flex-col gap-3 lg:grid lg:gap-2.5" style={{ gridTemplateColumns: "repeat(60, minmax(0, 1fr))", gridAutoRows: "12px" }}>
                {items.map((it) => (
                  <div key={`${it.id}-${nonce}`} className="h-80 lg:h-auto"
                    style={{ gridColumn: `${Math.min(it.x, 59) + 1} / span ${Math.max(1, Math.min(it.w, 60 - Math.min(it.x, 59)))}`, gridRow: `${it.y + 1} / span ${Math.max(8, it.h)}` }}>
                    <Dhis2DashboardItem connId={connId} item={it} onPivot={setPivotOf} onExpand={setExpand} />
                  </div>
                ))}
              </div>
            )}
        </main>
        <PivotDialog r={pivotOf} onClose={() => setPivotOf(null)} />
        <Dialog open={!!expand} onOpenChange={(o) => !o && setExpand(null)}>
          <DialogContent className="max-w-6xl h-[85dvh] flex flex-col">
            <DialogHeader><DialogTitle>{expand?.viz.name}</DialogTitle><DialogDescription>Full-screen view</DialogDescription></DialogHeader>
            <div className="flex-1 min-h-0">{expand && <ChartBody r={expand} />}</div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
