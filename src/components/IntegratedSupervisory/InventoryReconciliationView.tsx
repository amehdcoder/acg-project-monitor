/**
 * Inventory reconciliation — stock in vs stock out at each custodian level.
 *
 *  Leg A: State → LGA EDO receipts vs LGA EDO → FLHF issues (by medicine).
 *  Leg B: LGA EDO → FLHF worker issues vs FLHF worker → CDD issues (by medicine).
 *
 * Discrepancies are surfaced with WHO-style risk tones; over-issuance (more
 * units pushed downstream than were ever received) is an accountability breach.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, ArrowDownUp, Download, Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { medicineLabel, type LogisticsDataset } from "@/lib/isc/medicineAccountability";
import {
  EXPIRY_TONE, expiryInfo, reconcileEdoVsFlhf, reconcileFlhfVsCdd, RECON_TONE,
  type ReconRow, type ReconSummary,
} from "@/lib/isc/custodianReconciliation";
import { exportCsv } from "./exportKoboData";

const nf = (n: number) => Math.round(n).toLocaleString();
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function KpiChip({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color: tone }}>{value}</div>
    </div>
  );
}

function ReconTable({
  summary, inLabel, outLabel, holderLabel, title, subtitle, accent, filename, showFacility,
}: {
  summary: ReconSummary; inLabel: string; outLabel: string; holderLabel: string;
  title: string; subtitle: string; accent: string; filename: string; showFacility?: boolean;
}) {
  const [q, setQ] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const dq = useDebouncedValue(q, 300);

  const rows = useMemo(() => {
    const n = dq.trim().toLowerCase();
    return summary.rows.filter((r) => {
      if (onlyIssues && r.status === "balanced") return false;
      if (!n) return true;
      return [r.holder, r.state, r.lga, r.ward, r.facility, medicineLabel(r.medicine), r.batches.join(" ")]
        .join(" ").toLowerCase().includes(n);
    });
  }, [summary.rows, dq, onlyIssues]);

  const cols = [
    { key: "holder", label: holderLabel },
    ...(showFacility ? [{ key: "facility", label: "Health facility" }] : []),
    { key: "state", label: "State" },
    { key: "lga", label: "LGA" },
    { key: "medicine", label: "Medicine" },
    { key: "inQty", label: inLabel },
    { key: "damaged", label: "Damaged" },
    { key: "usable", label: "Usable held" },
    { key: "outQty", label: outLabel },
    { key: "variance", label: "Variance (usable − issued)" },
    { key: "pushRate", label: "Push rate" },
    { key: "status", label: "Reconciliation status" },
    { key: "earliestExpiry", label: "Earliest expiry" },
    { key: "batches", label: "Batch / lot no." },
  ];

  const exportRows = rows.map((r) => ({
    holder: r.holder, facility: r.facility, state: r.state, lga: r.lga,
    medicine: medicineLabel(r.medicine), inQty: r.inQty, damaged: r.damaged, usable: r.usable,
    outQty: r.outQty, variance: r.variance, pushRate: pct(r.pushRate),
    status: RECON_TONE[r.status].label, earliestExpiry: r.earliestExpiry || "—", batches: r.batches.join("; "),
  }));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-4" style={{ background: `${accent}12` }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: accent }}>
            <ArrowDownUp className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold" style={{ color: accent }}>{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant={onlyIssues ? "default" : "outline"} className="h-8 text-xs"
              onClick={() => setOnlyIssues((v) => !v)}>
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> {onlyIssues ? "Showing discrepancies" : "Discrepancies only"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 bg-background"
              onClick={() => exportCsv(exportRows, cols, null, filename)}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <KpiChip label="Units in" value={nf(summary.totals.usable)} tone={accent} />
          <KpiChip label="Units issued on" value={nf(summary.totals.outQty)} tone={accent} />
          <KpiChip label="Net variance" value={nf(summary.totals.variance)}
            tone={summary.totals.variance < 0 ? RECON_TONE.over_issued.fg : accent} />
          <KpiChip label="Discrepancy lines" value={nf(summary.discrepancies)} tone={RECON_TONE.under_distributed.fg} />
          <KpiChip label="Over-issued (breach)" value={nf(summary.overIssued)} tone={RECON_TONE.over_issued.fg} />
        </div>

        <div className="relative mt-3 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-9 bg-background pl-8"
            placeholder="Search custodian, LGA, facility, medicine, batch..." />
        </div>
      </div>

      <div className="max-h-[62vh] overflow-auto rounded-xl border bg-background">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="text-white" style={{ background: accent }}>
              <th className="px-3 py-2 text-left font-semibold">#</th>
              {cols.map((c) => (
                <th key={c.key} className="min-w-[100px] whitespace-nowrap border-l border-white/10 px-3 py-2 text-left font-semibold">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length + 1} className="px-4 py-10 text-center text-muted-foreground">
                No reconcilable transactions for this leg in the current filter window.
              </td></tr>
            ) : rows.map((r: ReconRow, i) => {
              const tone = RECON_TONE[r.status];
              const exp = expiryInfo(r.earliestExpiry);
              const expTone = EXPIRY_TONE[exp.risk];
              return (
                <tr key={r.key} className={i % 2 ? "bg-muted/30" : ""}
                  style={r.status === "over_issued" ? { background: RECON_TONE.over_issued.bg, boxShadow: `inset 3px 0 0 ${RECON_TONE.over_issued.fg}` } : undefined}>
                  <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5 font-semibold text-foreground">{r.holder}</td>
                  {showFacility && <td className="px-3 py-1.5">{r.facility}</td>}
                  <td className="px-3 py-1.5">{r.state || "—"}</td>
                  <td className="px-3 py-1.5">{r.lga || "—"}</td>
                  <td className="px-3 py-1.5 font-medium">{medicineLabel(r.medicine)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{nf(r.inQty)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-destructive">{nf(r.damaged)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{nf(r.usable)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{nf(r.outQty)}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums"
                    style={{ color: r.variance < 0 ? RECON_TONE.over_issued.fg : accent }}>
                    {r.variance > 0 ? "+" : ""}{nf(r.variance)}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.pushRate * 100)}%`, background: tone.fg }} />
                      </div>
                      <span className="tabular-nums">{pct(r.pushRate)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
                      {tone.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: expTone.bg, color: expTone.fg, borderColor: expTone.border }}
                      title={exp.label}>
                      {r.earliestExpiry || "No expiry"}{exp.days !== null ? ` · ${exp.days}d` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[10px]">{r.batches.slice(0, 3).join(", ") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InventoryReconciliationView({ dataset }: { dataset: LogisticsDataset }) {
  const legA = useMemo(() => reconcileEdoVsFlhf(dataset), [dataset]);
  const legB = useMemo(() => reconcileFlhfVsCdd(dataset), [dataset]);
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
        <Badge variant="outline" className="bg-background">Leg A discrepancies: {legA.discrepancies}</Badge>
        <Badge variant="outline" className="bg-background">Leg B discrepancies: {legB.discrepancies}</Badge>
        <span className="text-muted-foreground">
          Balanced = ≥95% of usable stock pushed onward · Over-issued = more units issued than ever received (breach).
        </span>
      </div>

      <Tabs defaultValue="a" className="space-y-3">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="a" className="text-xs">LGA EDO receipts vs FLHF issues</TabsTrigger>
          <TabsTrigger value="b" className="text-xs">FLHF worker issues vs CDD issues</TabsTrigger>
        </TabsList>

        <TabsContent value="a">
          <ReconTable
            summary={legA} accent="hsl(214,72%,32%)" holderLabel="LGA EDO / Logistic Officer"
            inLabel="Received from State" outLabel="Issued to FLHF workers"
            title="Leg A — LGA store reconciliation (State receipts vs FLHF issuance)"
            subtitle="Per LGA and medicine: units acknowledged from the State medical store against units pushed onward to facilities."
            filename={`Reconciliation_EDO_vs_FLHF_${stamp}.csv`}
          />
        </TabsContent>

        <TabsContent value="b">
          <ReconTable
            summary={legB} accent="hsl(168,64%,26%)" holderLabel="FLHF health worker (in-charge)" showFacility
            inLabel="Received from LGA EDO" outLabel="Issued to CDDs"
            title="Leg B — Facility reconciliation (LGA issues vs CDD issuance)"
            subtitle="Per facility and medicine: units received from the LGA store against units issued to community-directed distributors."
            filename={`Reconciliation_FLHF_vs_CDD_${stamp}.csv`}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
