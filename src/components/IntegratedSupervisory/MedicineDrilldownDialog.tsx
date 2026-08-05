/**
 * KPI drill-down dialog for the Medicine Accountability dashboard.
 *
 * Explodes a headline supply-integrity KPI into the state / LGA / facility /
 * batch rows that produce it, with the formula and data-quality caveats shown
 * alongside so the number can be defended in a supervision meeting.
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Info, Search, Sigma } from "lucide-react";
import type { DrillReport, DrillTable } from "@/lib/isc/medicineDrilldown";

const SEV_ROW = ["", "bg-amber-50/70", "bg-destructive/5"];
const SEV_BADGE = ["bg-emerald-600", "bg-amber-500", "bg-destructive"];

function DrillTableView({ table }: { table: DrillTable }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return table.rows;
    return table.rows.filter((r) =>
      table.columns.some((c) => String((r as any)[c.key] ?? "").toLowerCase().includes(needle)));
  }, [q, table]);

  const exportCsv = () => {
    const esc = (c: unknown) => `"${String(c ?? "").replace(/"/g, '""')}"`;
    const csv = [
      table.columns.map((c) => esc(c.label)).join(","),
      ...rows.map((r) => table.columns.map((c) => esc((r as any)[c.key])).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table.id}-drilldown-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter rows…"
            className="h-8 w-[220px] pl-7 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{rows.length.toLocaleString()} rows</Badge>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        </div>
      </div>
      {table.note && (
        <p className="flex gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />{table.note}
        </p>
      )}
      <div className="rounded-md border overflow-x-auto max-h-[52vh] overflow-y-auto">
        <Table className="min-w-[720px]">
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              {table.columns.map((c) => (
                <TableHead key={c.key} className={`whitespace-nowrap text-[11px] ${c.align === "right" ? "text-right" : ""}`}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={table.columns.length} className="py-8 text-center text-xs text-muted-foreground">
                  No rows to show for the current filters.
                </TableCell>
              </TableRow>
            )}
            {rows.slice(0, 400).map((r, i) => (
              <TableRow key={i} className={SEV_ROW[Number(r._sev ?? 0)]}>
                {table.columns.map((c) => {
                  const v = (r as any)[c.key];
                  return (
                    <TableCell key={c.key}
                      className={`text-xs align-top ${c.align === "right" ? "text-right" : "break-words"}`}>
                      {c.badge ? (
                        <Badge className={`text-[10px] text-white ${SEV_BADGE[Number(r._sev ?? 0)]}`}>{String(v ?? "—")}</Badge>
                      ) : typeof v === "number" ? v.toLocaleString() : String(v ?? "—")}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length > 400 && (
        <p className="text-[11px] text-muted-foreground">Showing the first 400 rows — export for the full list.</p>
      )}
    </div>
  );
}

interface Props {
  report: DrillReport | null;
  onOpenChange: (open: boolean) => void;
}

export default function MedicineDrilldownDialog({ report, onOpenChange }: Props) {
  if (!report) return null;
  return (
    <Dialog open={!!report} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] xl:max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{report.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">{report.subtitle}</p>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <p className="flex items-start gap-1.5 text-[11px] font-mono text-muted-foreground">
            <Sigma className="h-3.5 w-3.5 shrink-0 mt-0.5" />{report.formula}
          </p>
          <ul className="space-y-1">
            {report.quality.map((q, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />{q}
              </li>
            ))}
          </ul>
        </div>

        <Tabs defaultValue={report.tables[0]?.id}>
          <TabsList className="flex-wrap h-auto">
            {report.tables.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="text-xs">
                {t.title} <span className="ml-1 text-[10px] text-muted-foreground">({t.rows.length})</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {report.tables.map((t) => (
            <TabsContent key={t.id} value={t.id} className="mt-3">
              <DrillTableView table={t} />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
