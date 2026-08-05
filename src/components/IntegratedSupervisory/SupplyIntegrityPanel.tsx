/**
 * Supply Chain Integrity & Loss + Allocation Equity panel for the Medicine
 * Accountability dashboard.
 *
 * Renders four indicator families:
 *  1. Transit shrinkage rate (%) — leg-by-leg discrepancy between quantities
 *     issued upstream and quantities confirmed downstream.
 *  2. Expiry risk index (%) — share of live LGA/facility stock sitting in
 *     batches within N days of expiry.
 *  3. Buffer retention ratio — stock held back at LGA/facility stores versus
 *     stock deployed to CDDs (optionally measured at campaign kickoff).
 *  4. Facility equity index — coefficient of variation of facility allocations
 *     within each LGA, flagging over-served and under-served catchments.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowDownWideNarrow, CalendarClock, Info, Scale, ShieldAlert, TrendingDown, Warehouse,
} from "lucide-react";
import type { SupplyIntegrity } from "@/lib/isc/medicineAccountability";

const fmt = (n: number) => Math.round(n).toLocaleString();
const pctf = (n: number) => `${(n * 100).toFixed(1)}%`;

const GREEN = "hsl(152 60% 40%)";
const AMBER = "hsl(45 93% 47%)";
const ORANGE = "hsl(25 95% 53%)";
const RED = "hsl(0 72% 51%)";
const BLUE = "hsl(217 91% 60%)";

const BAND_COLOR: Record<string, string> = {
  equitable: GREEN, moderate: AMBER, inequitable: RED,
  balanced: GREEN, "under-deployed": ORANGE, "over-deployed": AMBER,
};

function Metric({
  icon: Icon, label, value, sub, tone, formula,
}: { icon: any; label: string; value: string; sub: string; tone: "good" | "warn" | "bad" | "info"; formula: string }) {
  const cls =
    tone === "bad" ? "border-destructive/40 bg-destructive/5" :
    tone === "warn" ? "border-amber-300 bg-amber-50" :
    tone === "good" ? "border-emerald-300 bg-emerald-50" : "border-primary/30 bg-primary/5";
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> <span className="truncate">{label}</span>
      </div>
      <p className="font-display text-2xl font-bold leading-tight mt-1">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      <p className="mt-2 rounded border bg-background/70 px-2 py-1 text-[10px] font-mono leading-snug text-muted-foreground break-words">
        {formula}
      </p>
    </div>
  );
}

interface Props {
  integrity: SupplyIntegrity;
  expiryWindow: number;
  onExpiryWindow: (n: number) => void;
  kickoff: string;
  onKickoff: (v: string) => void;
}

export default function SupplyIntegrityPanel({
  integrity, expiryWindow, onExpiryWindow, kickoff, onKickoff,
}: Props) {
  const { shrinkage, expiryRisk, buffer, equity } = integrity;

  const legChart = shrinkage.legs.map((l) => ({
    name: l.stage,
    Loss: Number((l.rate * 100).toFixed(1)),
  }));

  const equityChart = equity.rows.slice(0, 20).map((r) => ({
    name: r.lga || "—",
    CV: Number((r.cv * 100).toFixed(1)),
    band: r.band,
  }));

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Expiry horizon</span>
            <Input type="number" min={7} className="h-8 w-20 text-xs bg-background"
              value={expiryWindow} onChange={(e) => onExpiryWindow(Math.max(7, Number(e.target.value) || 60))} />
            <span className="text-[11px] text-muted-foreground">days</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Campaign kickoff</span>
            <Input type="date" className="h-8 w-[150px] text-xs bg-background"
              value={kickoff} onChange={(e) => onKickoff(e.target.value)} />
            <span className="text-[11px] text-muted-foreground">
              {kickoff ? "buffer measured on transactions up to kickoff" : "buffer measured on all transactions"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Headline metrics */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={TrendingDown}
          label="Transit shrinkage rate"
          value={pctf(shrinkage.overall.rate)}
          tone={shrinkage.overall.rate > 0.05 ? "bad" : shrinkage.overall.rate > 0.02 ? "warn" : "good"}
          sub={`${fmt(shrinkage.overall.variance)} units unaccounted of ${fmt(shrinkage.overall.issued)} issued across ${shrinkage.legs.length} cascade legs`}
          formula="(Qty Issued L1 − Qty Received L2) ÷ Qty Issued L1 × 100"
        />
        <Metric
          icon={CalendarClock}
          label={`Expiry risk index (${expiryRisk.windowDays}d)`}
          value={pctf(expiryRisk.index)}
          tone={expiryRisk.index > 0.15 ? "bad" : expiryRisk.index > 0.05 ? "warn" : "good"}
          sub={`${fmt(expiryRisk.stockAtRisk)} of ${fmt(expiryRisk.totalStock)} units on hand in ${expiryRisk.batchesAtRisk.length} short-dated batches`}
          formula={`Stock at LGA/HF expiring ≤ ${expiryRisk.windowDays}d ÷ total stock on hand × 100`}
        />
        <Metric
          icon={Warehouse}
          label="Buffer retention ratio"
          value={buffer.ratio === null ? "—" : `${buffer.ratio.toFixed(2)} : 1`}
          tone={buffer.band === "balanced" ? "good" : buffer.band === "under-deployed" ? "bad" : "warn"}
          sub={`${fmt(buffer.retained)} retained (LGA ${fmt(buffer.retainedLga)} · HF ${fmt(buffer.retainedFlhf)}) vs ${fmt(buffer.deployedCdd)} deployed to CDDs — ${buffer.band}`}
          formula="Stock retained at LGA + HF stores ÷ stock deployed to CDDs"
        />
        <Metric
          icon={Scale}
          label="Facility equity index (CV)"
          value={equity.rows.length ? equity.weightedCv.toFixed(2) : "—"}
          tone={equity.weightedCv <= 0.25 ? "good" : equity.weightedCv <= 0.5 ? "warn" : "bad"}
          sub={`Volume-weighted dispersion across ${equity.facilities} facilities in ${equity.lgas} LGAs — ${equity.weightedCv <= 0.25 ? "equitable" : equity.weightedCv <= 0.5 ? "moderate spread" : "inequitable"}`}
          formula="CV = σ(facility allocation) ÷ mean(facility allocation) within each LGA"
        />
      </div>

      {/* Shrinkage ledger */}
      <Card>
        <CardHeader className="py-3 px-4 border-b bg-muted/40">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" /> Transit shrinkage by cascade leg
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="whitespace-nowrap">Cascade leg</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Qty issued upstream</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Qty confirmed downstream</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Variance (units)</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Shrinkage</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Consignments</TableHead>
                  <TableHead className="whitespace-nowrap">Measurement basis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shrinkage.legs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                      No matched consignments yet — enter State/LGA allocations and sync logistics submissions.
                    </TableCell>
                  </TableRow>
                )}
                {shrinkage.legs.map((l) => (
                  <TableRow key={l.stage} className={l.rate > 0.05 ? "bg-destructive/5" : ""}>
                    <TableCell className="text-xs font-medium align-top whitespace-nowrap">{l.stage}</TableCell>
                    <TableCell className="text-xs text-right align-top">{fmt(l.issued)}</TableCell>
                    <TableCell className="text-xs text-right align-top">{fmt(l.received)}</TableCell>
                    <TableCell className={`text-xs text-right align-top font-semibold ${l.variance > 0 ? "text-destructive" : "text-emerald-600"}`}>
                      {l.variance > 0 ? `−${fmt(l.variance)}` : `+${fmt(Math.abs(l.variance))}`}
                    </TableCell>
                    <TableCell className="text-xs text-right align-top">
                      <Badge className="text-[10px] text-white"
                        style={{ backgroundColor: l.rate > 0.05 ? RED : l.rate > 0.02 ? AMBER : GREEN }}>
                        {pctf(l.rate)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right align-top">{l.n}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground align-top whitespace-normal">{l.basis}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {legChart.length > 0 && (
            <div className="p-4 h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={legChart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `${v}% loss`} />
                  <ReferenceLine y={2} stroke={AMBER} strokeDasharray="4 4" label={{ value: "2% tolerance", fontSize: 10, fill: "hsl(45 93% 35%)" }} />
                  <Bar dataKey="Loss" radius={[4, 4, 0, 0]}>
                    {legChart.map((d, i) => (
                      <Cell key={i} fill={d.Loss > 5 ? RED : d.Loss > 2 ? AMBER : GREEN} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="px-4 pb-3 text-[11px] text-muted-foreground flex gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            A positive variance means units left the upstream tier but were never confirmed downstream — the signal for
            diversion, mis-recording or unreported damage. Negative variance means more was received than dispatched on
            record, which usually points to an unlogged consignment.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Expiry risk */}
        <Card>
          <CardHeader className="py-3 px-4 border-b bg-muted/40 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-600" /> Expiry risk index — stock within {expiryRisk.windowDays} days of expiry
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">{expiryRisk.batchesAtRisk.length} batches</Badge>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">Share of live stock at expiry risk</span>
                <span className="text-muted-foreground">{fmt(expiryRisk.stockAtRisk)} / {fmt(expiryRisk.totalStock)} units</span>
              </div>
              <Progress value={Math.min(100, expiryRisk.index * 100)} className="h-2" />
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[520px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="whitespace-nowrap">Batch</TableHead>
                    <TableHead className="whitespace-nowrap">Held at</TableHead>
                    <TableHead className="whitespace-nowrap">Expiry</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Days left</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Units on hand</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiryRisk.batchesAtRisk.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                        No stock on hand is within {expiryRisk.windowDays} days of expiry.
                      </TableCell>
                    </TableRow>
                  )}
                  {expiryRisk.batchesAtRisk.slice(0, 60).map((b, i) => (
                    <TableRow key={`${b.batch}-${i}`} className={(b.daysToExpiry ?? 0) < 0 ? "bg-destructive/5" : "bg-amber-50/60"}>
                      <TableCell className="text-xs font-mono align-top break-words">{b.batch}</TableCell>
                      <TableCell className="text-xs align-top break-words">{[b.lga, b.state].filter(Boolean).join(", ") || "—"}</TableCell>
                      <TableCell className="text-xs align-top whitespace-nowrap">{b.expiry || "—"}</TableCell>
                      <TableCell className="text-xs text-right align-top">
                        <Badge className="text-[10px] text-white"
                          style={{ backgroundColor: (b.daysToExpiry ?? 0) < 0 ? RED : (b.daysToExpiry ?? 0) <= 30 ? ORANGE : AMBER }}>
                          {(b.daysToExpiry ?? 0) < 0 ? `${Math.abs(b.daysToExpiry!)}d expired` : `${b.daysToExpiry}d`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right align-top font-semibold">{fmt(b.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Buffer retention */}
        <Card>
          <CardHeader className="py-3 px-4 border-b bg-muted/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-primary" /> Buffer retention — warehouse hold-back vs CDD deployment
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "LGA warehouses", v: buffer.retainedLga, color: BLUE },
                { label: "Health facility stores", v: buffer.retainedFlhf, color: AMBER },
                { label: "Deployed to CDDs", v: buffer.deployedCdd, color: GREEN },
              ].map((x) => (
                <div key={x.label} className="rounded-lg border p-2.5">
                  <div className="h-1.5 w-8 rounded-full mb-2" style={{ backgroundColor: x.color }} />
                  <p className="text-[11px] text-muted-foreground leading-tight">{x.label}</p>
                  <p className="font-display text-lg font-bold">{fmt(x.v)}</p>
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">Retained share of mobilised stock</span>
                <Badge className="text-[10px] text-white" style={{ backgroundColor: BAND_COLOR[buffer.band] }}>
                  {pctf(buffer.retainedShare)} · {buffer.band}
                </Badge>
              </div>
              <Progress value={Math.min(100, buffer.retainedShare * 100)} className="h-2" />
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-[11px] text-muted-foreground space-y-1">
              <p>
                Buffer retention ratio = (LGA balance + facility balance) ÷ quantity issued to CDDs
                {buffer.kickoff ? `, restricted to transactions dated on or before the campaign kickoff (${buffer.kickoff}).` : ", across all synced transactions."}
              </p>
              <p>
                A ratio above 1.5 (retained share &gt; 60%) signals medicines still sitting in warehouses when CDDs should
                already be mobilised; below 0.25 signals a thin buffer with no contingency for resupply.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Equity */}
      <Card>
        <CardHeader className="py-3 px-4 border-b bg-muted/40 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ArrowDownWideNarrow className="h-4 w-4 text-primary" /> Facility allocation equity within LGAs
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">Weighted CV {equity.weightedCv.toFixed(2)}</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {equityChart.length > 0 && (
            <div className="p-4 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={equityChart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis unit="%" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `CV ${(Number(v) / 100).toFixed(2)}`} />
                  <ReferenceLine y={25} stroke={GREEN} strokeDasharray="4 4" label={{ value: "equitable ≤ 0.25", fontSize: 10, fill: "hsl(152 60% 30%)" }} />
                  <ReferenceLine y={50} stroke={RED} strokeDasharray="4 4" label={{ value: "inequitable > 0.50", fontSize: 10, fill: "hsl(0 72% 40%)" }} />
                  <Bar dataKey="CV" radius={[4, 4, 0, 0]}>
                    {equityChart.map((d, i) => <Cell key={i} fill={BAND_COLOR[d.band]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table className="min-w-[1000px]">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="whitespace-nowrap">LGA</TableHead>
                  <TableHead className="whitespace-nowrap">State</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Facilities</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Total issued</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Mean / facility</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Std. dev.</TableHead>
                  <TableHead className="whitespace-nowrap text-right">CV</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Gini</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Min → Max</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Over-served</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Under-served</TableHead>
                  <TableHead className="whitespace-nowrap">Equity band</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equity.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-xs text-muted-foreground py-6">
                      Equity needs at least two supplied facilities in an LGA — none recorded yet.
                    </TableCell>
                  </TableRow>
                )}
                {equity.rows.slice(0, 200).map((r, i) => (
                  <TableRow key={`${r.state}-${r.lga}-${i}`} className={r.band === "inequitable" ? "bg-destructive/5" : ""}>
                    <TableCell className="text-xs font-medium align-top break-words">{r.lga || "—"}</TableCell>
                    <TableCell className="text-xs align-top break-words">{r.state || "—"}</TableCell>
                    <TableCell className="text-xs text-right align-top">{r.facilities}</TableCell>
                    <TableCell className="text-xs text-right align-top">{fmt(r.total)}</TableCell>
                    <TableCell className="text-xs text-right align-top">{fmt(r.mean)}</TableCell>
                    <TableCell className="text-xs text-right align-top">{fmt(r.sd)}</TableCell>
                    <TableCell className="text-xs text-right align-top font-semibold">{r.cv.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right align-top">{r.gini.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right align-top whitespace-nowrap">{fmt(r.min)} → {fmt(r.max)}</TableCell>
                    <TableCell className="text-xs text-right align-top text-amber-700 font-medium">{r.overServed}</TableCell>
                    <TableCell className="text-xs text-right align-top text-destructive font-medium">{r.underServed}</TableCell>
                    <TableCell className="align-top">
                      <Badge className="text-[10px] text-white" style={{ backgroundColor: BAND_COLOR[r.band] }}>{r.band}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="px-4 py-3 text-[11px] text-muted-foreground flex gap-1.5 border-t">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            The coefficient of variation measures how unevenly medicines are spread across facilities inside the same LGA
            (0 = every facility gets an identical quantity). Over-served facilities hold more than 1.5× the LGA mean and
            under-served facilities less than 0.5×, identifying catchments to rebalance before the campaign closes. The
            Gini coefficient is shown alongside as a distribution-shape cross-check.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
