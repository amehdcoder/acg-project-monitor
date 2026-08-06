/**
 * Level 0 cascade panel — Federal → State → LGA balance ladder plus the
 * State-dispatch vs EDO/Logistic-Officer-confirmed verification ledger.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Download, Truck, Warehouse } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { medicineLabel } from "@/lib/isc/medicineAccountability";
import {
  cascadeCsv, verifyStatusLabel,
  type CascadeSummary, type LevelBalance, type StateLedgerRow, type VerifyStatus,
} from "@/lib/isc/medicineCascade";

const fmt = (n: number) => Math.round(n).toLocaleString();
const pctf = (n: number) => `${(n * 100).toFixed(1)}%`;

const STATUS_COLOR: Record<VerifyStatus, string> = {
  verified: "hsl(152 60% 40%)",
  short: "hsl(0 72% 51%)",
  over: "hsl(262 70% 58%)",
  unconfirmed: "hsl(25 95% 53%)",
  unrecorded: "hsl(45 93% 47%)",
};

interface Props {
  cascade: CascadeSummary;
  levels: LevelBalance[];
  states: StateLedgerRow[];
  tolerance: number;
  onTolerance: (v: number) => void;
  canExport?: boolean;
}

export default function CascadeVerificationPanel({
  cascade, levels, states, tolerance, onTolerance, canExport = true,
}: Props) {
  const [status, setStatus] = useState<"all" | VerifyStatus>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => cascade.rows.filter((r) =>
    (status === "all" || r.status === status) &&
    (!q || `${r.state} ${r.lga} ${medicineLabel(r.medicine)} ${r.edo} ${r.slo}`.toLowerCase().includes(q.toLowerCase()))),
    [cascade.rows, status, q]);

  const download = () => {
    const blob = new Blob([cascadeCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `state-to-lga-verification-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chart = states.slice(0, 15).map((s) => ({
    name: s.state,
    Allocated: s.allocated,
    Dispatched: s.dispatched,
    Confirmed: s.confirmed,
  }));

  return (
    <div className="space-y-4">
      {/* Balance ladder */}
      <Card>
        <CardHeader className="py-3 px-4 border-b bg-muted/40">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-primary" /> Balance at every level of the supply chain
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {levels.map((l, i) => (
              <div key={l.level} className="relative rounded-xl border bg-card p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {i === 0 ? "Origin" : `Tier ${i}`}
                </p>
                <p className="text-xs font-semibold mt-0.5 leading-snug">{l.label}</p>
                <p className="font-display text-2xl font-bold mt-1">{fmt(l.balance)}</p>
                <p className="text-[10px] text-muted-foreground">units on hand</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  In {fmt(l.inflow)} · Out {fmt(l.outflow)}
                </p>
                <p className="text-[10px] text-primary mt-1">{l.custodian}</p>
                {i < levels.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            State balance = Federal allocation − Level 0 dispatches to LGAs. LGA balance = net usable confirmed by the
            EDO / Logistic Officer − quantity issued to health facilities. Negative balances mean more stock moved than
            was recorded arriving, and need reconciliation at source.
          </p>
        </CardContent>
      </Card>

      {/* Allocation → dispatch → confirmation funnel */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Federal allocated (FMS Oshodi)", value: cascade.totals.allocated, sub: "Manual consignment entry" },
          { label: "Dispatched State → LGA (Level 0)", value: cascade.totals.dispatched, sub: `${pctf(cascade.totals.fulfilment)} of allocation released` },
          { label: "Confirmed received at LGA (Level 1)", value: cascade.totals.confirmed, sub: `${pctf(cascade.totals.verification)} of dispatch verified by EDO / LO` },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className="font-display text-2xl font-bold mt-1">{fmt(k.value)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold">Dispatch → confirmation verification</span>
            <span className="text-muted-foreground">
              {fmt(Math.abs(cascade.totals.variance))} units {cascade.totals.variance >= 0 ? "unconfirmed" : "over-received"} ·
              {" "}{pctf(Math.abs(cascade.totals.varianceRate))} variance
            </span>
          </div>
          <Progress value={Math.min(100, cascade.totals.verification * 100)} className="h-2" />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(Object.keys(cascade.counts) as VerifyStatus[]).map((s) => (
              <Badge key={s} variant="outline" className="text-[10px]" style={{ borderColor: STATUS_COLOR[s], color: STATUS_COLOR[s] }}>
                {verifyStatusLabel[s]}: {cascade.counts[s]}
              </Badge>
            ))}
            {cascade.avgLeadDays !== null && (
              <Badge variant="outline" className="text-[10px]">
                Avg State → LGA lead: {cascade.avgLeadDays.toFixed(1)} days
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* State ledger chart */}
      {chart.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4 border-b bg-muted/40">
            <CardTitle className="text-sm font-semibold">Allocated vs dispatched vs confirmed, by State</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Allocated" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Dispatched" fill="hsl(262 70% 58%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Confirmed" fill="hsl(152 60% 40%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* State store ledger */}
      <Card>
        <CardHeader className="py-3 px-4 border-b bg-muted/40">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" /> State medical store ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>State</TableHead>
                <TableHead className="text-right">Allocated (Federal)</TableHead>
                <TableHead className="text-right">Dispatched to LGAs</TableHead>
                <TableHead className="text-right">Confirmed at LGAs</TableHead>
                <TableHead className="text-right">State store balance</TableHead>
                <TableHead className="text-right">Release rate</TableHead>
                <TableHead className="text-right">Verification rate</TableHead>
                <TableHead className="text-right">LGAs supplied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {states.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">
                  No Level 0 dispatches or Federal allocations recorded yet.
                </TableCell></TableRow>
              )}
              {states.map((s) => (
                <TableRow key={s.state}>
                  <TableCell className="text-xs font-medium">{s.state || "—"}</TableCell>
                  <TableCell className="text-xs text-right">{s.allocated ? fmt(s.allocated) : "—"}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(s.dispatched)}</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{fmt(s.confirmed)}</TableCell>
                  <TableCell className={`text-xs text-right font-semibold ${s.stateBalance < 0 ? "text-destructive" : ""}`}>{fmt(s.stateBalance)}</TableCell>
                  <TableCell className="text-xs text-right">{s.allocated ? pctf(s.fulfilment) : "—"}</TableCell>
                  <TableCell className="text-xs text-right">
                    <Badge variant={s.verification >= 0.95 ? "secondary" : "destructive"} className="text-[10px]">
                      {s.dispatched ? pctf(s.verification) : "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right">{s.lgas}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Verification ledger */}
      <Card>
        <CardHeader className="py-3 px-4 border-b bg-muted/40 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">
              State dispatch vs EDO / Logistic Officer confirmation — line-by-line
            </CardTitle>
            {canExport && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={download} disabled={!rows.length}>
                <Download className="h-3.5 w-3.5 mr-1" /> CSV
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                {(Object.keys(verifyStatusLabel) as VerifyStatus[]).map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{verifyStatusLabel[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="h-8 w-[220px] text-xs" placeholder="Search state, LGA, officer…"
              value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Match tolerance</span>
              <Input type="number" min={0} max={50} className="h-8 w-16 text-xs"
                value={Math.round(tolerance * 100)}
                onChange={(e) => onTolerance(Math.min(50, Math.max(0, Number(e.target.value) || 0)) / 100)} />
              <span className="text-[11px] text-muted-foreground">%</span>
            </div>
            <Badge variant="outline" className="text-[10px]">{rows.length} lines</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[1180px]">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>State / LGA</TableHead>
                <TableHead>Medicine</TableHead>
                <TableHead className="text-right">Allocated</TableHead>
                <TableHead className="text-right">Dispatched (L0)</TableHead>
                <TableHead className="text-right">Confirmed (L1)</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="text-right">LGA balance</TableHead>
                <TableHead>SLO → EDO / Logistic Officer</TableHead>
                <TableHead className="text-right">Lead days</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-6">
                  Nothing matches this filter.
                </TableCell></TableRow>
              )}
              {rows.slice(0, 400).map((r, i) => (
                <TableRow key={`${r.state}-${r.lga}-${r.medicine}-${i}`}
                  className={r.status === "short" ? "bg-destructive/5" : r.status === "unconfirmed" ? "bg-amber-50" : ""}>
                  <TableCell className="text-xs font-medium align-top">
                    {r.lga || "—"}<div className="text-[11px] text-muted-foreground">{r.state}</div>
                  </TableCell>
                  <TableCell className="text-xs align-top break-words max-w-[160px]">{medicineLabel(r.medicine)}</TableCell>
                  <TableCell className="text-xs text-right">{r.allocated ? fmt(r.allocated) : "—"}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(r.dispatched)}</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{fmt(r.confirmed)}</TableCell>
                  <TableCell className={`text-xs text-right font-semibold ${r.variance > 0 ? "text-destructive" : r.variance < 0 ? "text-purple-600" : ""}`}>
                    {r.variance === 0 ? "0" : `${r.variance > 0 ? "+" : ""}${fmt(r.variance)}`}
                    <div className="text-[10px] text-muted-foreground">{pctf(r.varianceRate)}</div>
                  </TableCell>
                  <TableCell className={`text-xs text-right ${r.lgaBalance < 0 ? "text-destructive" : ""}`}>{fmt(r.lgaBalance)}</TableCell>
                  <TableCell className="text-[11px] align-top break-words max-w-[200px]">
                    {r.slo} <span className="text-muted-foreground">→</span> {r.edo}
                  </TableCell>
                  <TableCell className="text-xs text-right">{r.leadDays ?? "—"}</TableCell>
                  <TableCell className="text-[11px]">
                    {r.matchedBarcode
                      ? <Badge variant="secondary" className="text-[10px]">matched</Badge>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge className="text-[10px] text-white" style={{ backgroundColor: STATUS_COLOR[r.status] }}>
                      {verifyStatusLabel[r.status]}
                    </Badge>
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
