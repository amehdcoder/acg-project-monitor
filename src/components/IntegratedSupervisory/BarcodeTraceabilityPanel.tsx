/**
 * Barcode / QR traceability panel — unit-level chain of custody built from the
 * scanner question captured at every tier of the medicine cascade.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, QrCode, ScanLine, ShieldAlert } from "lucide-react";
import { medicineLabel } from "@/lib/isc/medicineAccountability";
import { traceStatusLabel, type BarcodeSummary, type TraceStatus } from "@/lib/isc/medicineCascade";

const fmt = (n: number) => Math.round(n).toLocaleString();
const pctf = (n: number) => `${(n * 100).toFixed(1)}%`;

const STATUS_STYLE: Record<TraceStatus, string> = {
  complete: "bg-emerald-600 text-white",
  at_facility: "bg-sky-600 text-white",
  at_lga: "bg-indigo-600 text-white",
  in_transit: "bg-amber-500 text-white",
  unmatched: "bg-destructive text-destructive-foreground",
  duplicate: "bg-purple-600 text-white",
};

const LEVEL_CHIP: Record<string, string> = {
  level_0: "State", level_1: "LGA", level_2: "FLHF", level_3: "CDD",
};

export default function BarcodeTraceabilityPanel({ trace }: { trace: BarcodeSummary }) {
  const [status, setStatus] = useState<"all" | TraceStatus>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => trace.rows.filter((r) =>
    (status === "all" || r.status === status) &&
    (!q || `${r.code} ${r.batch} ${r.state} ${r.lga} ${medicineLabel(r.medicine)}`.toLowerCase().includes(q.toLowerCase()))),
    [trace.rows, status, q]);

  const download = () => {
    const csv = [
      ["Barcode / QR", "Medicine", "Batch", "Expiry", "State", "LGA", "Tiers scanned", "Dispatched", "Confirmed",
        "Issued to FLHF", "Issued to CDD", "Balance", "Variance", "First scan", "Last scan", "Scans", "Facilities", "Status"].join(","),
      ...rows.map((r) => [
        r.code, medicineLabel(r.medicine), r.batch, r.expiry, r.state, r.lga,
        r.levels.map((l) => LEVEL_CHIP[l]).join(" → "), r.dispatched, r.confirmed, r.issuedToFlhf, r.issuedToCdd,
        r.balance, r.variance, r.firstSeen, r.lastSeen, r.scans, r.facilities.join("; "), traceStatusLabel[r.status],
      ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `barcode-traceability-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Scan coverage", value: pctf(trace.scanRate), sub: `${fmt(trace.scannedTx)} of ${fmt(trace.totalTx)} logistics transactions scanned`, icon: ScanLine },
          { label: "Unique codes in circulation", value: fmt(trace.uniqueCodes), sub: `${fmt(trace.unitsTraced)} units under barcode custody`, icon: QrCode },
          { label: "End-to-end traced", value: pctf(trace.traceRate), sub: `${fmt(trace.fullyTraced)} codes scanned at both State dispatch and LGA receipt`, icon: QrCode },
          { label: "Chain-of-custody breaks", value: fmt(trace.unmatched + trace.duplicates), sub: `${trace.unmatched} unmatched · ${trace.duplicates} single-tier repeat scans`, icon: ShieldAlert },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <k.icon className="h-4 w-4 text-primary shrink-0" />
              </div>
              <p className="font-display text-2xl font-bold mt-1">{k.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="py-3 px-4 border-b bg-muted/40">
          <CardTitle className="text-sm font-semibold">Scan compliance by cascade tier</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {trace.byLevel.map((l) => (
            <div key={l.level} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{l.label}</span>
                <span className="text-muted-foreground">{fmt(l.scanned)} / {fmt(l.total)} · {pctf(l.rate)}</span>
              </div>
              <Progress value={l.rate * 100} className="h-2" />
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground pt-1">
            Every consignment should carry the same barcode from the State store to the CDD. A code seen at the LGA but
            never at State dispatch signals stock entering the chain off-book; a code that stops moving after dispatch
            signals an unverified delivery.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4 border-b bg-muted/40 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Unit-level chain of custody</CardTitle>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={download} disabled={!rows.length}>
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="h-8 w-[240px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All trace statuses</SelectItem>
                {(Object.keys(traceStatusLabel) as TraceStatus[]).map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{traceStatusLabel[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="h-8 w-[220px] text-xs" placeholder="Search code, batch, LGA…"
              value={q} onChange={(e) => setQ(e.target.value)} />
            <Badge variant="outline" className="text-[10px]">{rows.length} codes</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[1120px]">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Barcode / QR</TableHead>
                <TableHead>Medicine · batch</TableHead>
                <TableHead>Geography</TableHead>
                <TableHead>Journey</TableHead>
                <TableHead className="text-right">Dispatched</TableHead>
                <TableHead className="text-right">Confirmed</TableHead>
                <TableHead className="text-right">To FLHF</TableHead>
                <TableHead className="text-right">To CDD</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Last scan</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-8">
                  No barcode or QR scans captured yet. Enable the scanner question in the linked KoboToolbox logistics
                  form to start unit-level traceability.
                </TableCell></TableRow>
              )}
              {rows.slice(0, 400).map((r) => (
                <TableRow key={r.code} className={r.status === "unmatched" ? "bg-destructive/5" : ""}>
                  <TableCell className="text-[11px] font-mono break-all max-w-[170px]">{r.code}</TableCell>
                  <TableCell className="text-xs">
                    {medicineLabel(r.medicine)}
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {r.batch}{r.expiry ? ` · exp ${r.expiry}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.lga || "—"}<div className="text-[10px] text-muted-foreground">{r.state}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.levels.map((l) => (
                        <Badge key={l} variant="secondary" className="text-[10px] px-1.5">{LEVEL_CHIP[l]}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-right">{fmt(r.dispatched)}</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{fmt(r.confirmed)}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(r.issuedToFlhf)}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(r.issuedToCdd)}</TableCell>
                  <TableCell className={`text-xs text-right font-semibold ${r.balance < 0 ? "text-destructive" : ""}`}>{fmt(r.balance)}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{r.lastSeen?.slice(0, 10) || "—"}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${STATUS_STYLE[r.status]}`}>{traceStatusLabel[r.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
