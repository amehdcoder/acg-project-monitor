/**
 * Custodian ledgers — WHO-standard person-level medicine accountability.
 *
 * Three registers derived from the parsed logistics cascade:
 *  1. Quantity received by each LGA EDO / Logistic Officer from the State.
 *  2. Quantity issued to each FLHF health worker by each LGA EDO.
 *  3. Quantity issued to each CDD by each FLHF health worker, with the
 *     target communities / settlements it was given for.
 */
import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Download, Minus, Plus, Scale, Search, Truck, UserCog, Users, Warehouse } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { medicineLabel, type LogisticsDataset } from "@/lib/isc/medicineAccountability";
import { EXPIRY_TONE, expiryInfo, type ExpiryRisk } from "@/lib/isc/custodianReconciliation";
import InventoryReconciliationView from "./InventoryReconciliationView";
import { exportCsv } from "./exportKoboData";

type MedMap = Record<string, number>;

interface Row {
  key: string;
  person: string;
  role: string;
  state: string;
  lga: string;
  ward: string;
  /** Facility / origin custodian context. */
  context: string;
  /** Communities / settlements served (level 3 only). */
  communities: string[];
  meds: MedMap;
  total: number;
  damaged: number;
  netUsable: number;
  txns: number;
  firstDate: string;
  lastDate: string;
  /** Batch / lot numbers seen for this custodian. */
  batches: string[];
  /** Batch → expiry date map, for the expiry risk column. */
  batchExpiry: Record<string, string>;
  /** Earliest expiry across the custodian's batches (drives risk highlighting). */
  earliestExpiry: string;
  /** Units held on batches that are expired or expiring within 90 days. */
  unitsAtRisk: number;
}

const nf = (n: number) => Math.round(n).toLocaleString();
const dash = (s: string) => (s && s !== "—" ? s : "—");

function blank(key: string, person: string, role: string, state: string, lga: string, ward: string, context: string): Row {
  return {
    key, person, role, state, lga, ward, context, communities: [], meds: {}, total: 0, damaged: 0,
    netUsable: 0, txns: 0, firstDate: "", lastDate: "",
    batches: [], batchExpiry: {}, earliestExpiry: "", unitsAtRisk: 0,
  };
}

/** Record a batch / lot number, its expiry and any at-risk units on the row. */
function trackBatch(row: Row, batch: string | undefined, expiry: string | undefined, qty: number) {
  const b = dash(batch ?? "");
  if (b !== "—" && !row.batches.includes(b)) row.batches.push(b);
  if (expiry) {
    if (b !== "—" && !row.batchExpiry[b]) row.batchExpiry[b] = expiry;
    if (!row.earliestExpiry || expiry < row.earliestExpiry) row.earliestExpiry = expiry;
    const risk = expiryInfo(expiry).risk;
    if (risk === "expired" || risk === "critical") row.unitsAtRisk += qty;
  }
}

function stamp(row: Row, date: string) {
  if (!date) return;
  if (!row.firstDate || date < row.firstDate) row.firstDate = date;
  if (!row.lastDate || date > row.lastDate) row.lastDate = date;
}

function buildRows(ds: LogisticsDataset) {
  /* 1 — LGA EDO receipts from State */
  const edo = new Map<string, Row>();
  for (const r of ds.receipts) {
    const person = dash(r.edoName) === "—" ? "Unnamed EDO / Logistic Officer" : r.edoName;
    const k = `${person}||${r.state}||${r.lga}`;
    const row = edo.get(k) ?? blank(k, person, "LGA EDO / Logistic Officer", r.state, r.lga, r.ward, dash(r.sloName));
    row.meds[r.medicine] = (row.meds[r.medicine] ?? 0) + r.qtyReceived;
    row.total += r.qtyReceived;
    row.damaged += r.qtyDamaged;
    row.netUsable += r.netUsable || r.qtyReceived - r.qtyDamaged;
    row.txns += 1;
    trackBatch(row, r.batch, r.expiry, r.qtyReceived);
    stamp(row, r.date);
    edo.set(k, row);
  }

  /* EDO custodian per LGA (used as the issuing officer for level 2) */
  const edoByLga = new Map<string, string>();
  for (const r of ds.receipts) {
    if (dash(r.edoName) !== "—" && !edoByLga.has(`${r.state}||${r.lga}`)) edoByLga.set(`${r.state}||${r.lga}`, r.edoName);
  }

  /* 2 — FLHF health workers issued by the LGA EDO */
  const flhf = new Map<string, Row>();
  for (const i of ds.issues) {
    const person = dash(i.inCharge) === "—" ? "Unnamed facility in-charge" : i.inCharge;
    const k = `${person}||${i.facility}||${i.lga}`;
    const row = flhf.get(k) ?? blank(k, person, `FLHF · ${dash(i.facility)}`, i.state, i.lga, i.ward,
      edoByLga.get(`${i.state}||${i.lga}`) ?? "Unnamed EDO / Logistic Officer");
    row.meds[i.medicine] = (row.meds[i.medicine] ?? 0) + i.qtyIssued;
    row.total += i.qtyIssued;
    row.txns += 1;
    trackBatch(row, i.batch, i.expiry, i.qtyIssued);
    stamp(row, i.date);
    flhf.set(k, row);
  }

  /* 3 — CDDs issued by the FLHF health worker, with target communities */
  const inChargeByFacility = new Map<string, string>();
  for (const i of ds.issues) {
    if (dash(i.inCharge) !== "—" && !inChargeByFacility.has(`${i.facility}||${i.lga}`)) inChargeByFacility.set(`${i.facility}||${i.lga}`, i.inCharge);
  }
  const cdd = new Map<string, Row>();
  for (const c of ds.cddIssues) {
    const person = dash(c.cddName) === "—" ? "Unnamed CDD" : c.cddName;
    const k = `${person}||${c.facility}||${c.lga}`;
    const row = cdd.get(k) ?? blank(k, person, "Community-Directed Distributor", c.state, c.lga, c.ward,
      `${dash(c.facility)} · ${inChargeByFacility.get(`${c.facility}||${c.lga}`) ?? "Unnamed in-charge"}`);
    row.meds[c.medicine] = (row.meds[c.medicine] ?? 0) + c.qtyIssued;
    row.total += c.qtyIssued;
    row.txns += 1;
    trackBatch(row, c.batch, c.expiry, c.qtyIssued);
    const com = dash(c.community);
    if (com !== "—" && !row.communities.includes(com)) row.communities.push(com);
    stamp(row, c.date);
    cdd.set(k, row);
  }

  const sort = (m: Map<string, Row>) => [...m.values()].sort((a, b) => b.total - a.total);
  return { edo: sort(edo), flhf: sort(flhf), cdd: sort(cdd) };
}

const TONES = {
  edo: { head: "hsl(214,72%,24%)", chip: "hsl(214,72%,24%)", soft: "hsl(214,72%,96%)" },
  flhf: { head: "hsl(168,64%,22%)", chip: "hsl(168,64%,24%)", soft: "hsl(168,60%,95%)" },
  cdd: { head: "hsl(280,52%,28%)", chip: "hsl(280,52%,32%)", soft: "hsl(280,52%,96%)" },
} as const;

function MedChips({ meds, tone }: { meds: MedMap; tone: string }) {
  const entries = Object.entries(meds).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([m, q]) => (
        <span key={m} className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: tone }}>
          {medicineLabel(m)}: {nf(q)}
        </span>
      ))}
    </div>
  );
}

/** Highest expiry risk band worth highlighting on a ledger row. */
function rowRisk(r: Row): ExpiryRisk | null {
  const risk = expiryInfo(r.earliestExpiry).risk;
  return risk === "expired" || risk === "critical" || risk === "watch" ? risk : null;
}

function ExpiryBadge({ expiry, unitsAtRisk }: { expiry: string; unitsAtRisk: number }) {
  const info = expiryInfo(expiry);
  const tone = EXPIRY_TONE[info.risk];
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="inline-flex w-fit items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold"
        style={{ background: tone.bg, color: tone.fg, borderColor: tone.border }}
        title={info.label}
      >
        {info.risk === "expired" || info.risk === "critical" ? <AlertTriangle className="h-3 w-3" /> : null}
        {expiry || "No expiry"}
      </span>
      {info.days !== null && (
        <span className="text-[9px]" style={{ color: tone.fg }}>
          {info.days < 0 ? `${Math.abs(info.days)}d overdue` : `${info.days}d left`}
          {unitsAtRisk > 0 ? ` · ${nf(unitsAtRisk)} at risk` : ""}
        </span>
      )}
    </div>
  );
}

function BatchChips({ batches, tone }: { batches: string[]; tone: string }) {
  if (!batches.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {batches.slice(0, 3).map((b) => (
        <span key={b} className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold"
          style={{ borderColor: tone, color: tone }}>{b}</span>
      ))}
      {batches.length > 3 && <span className="text-[10px] text-muted-foreground">+{batches.length - 3}</span>}
    </div>
  );
}

function LedgerTable({
  rows, tone, personLabel, contextLabel, showCommunities, showDamage, title, subtitle, icon, filename,
}: {
  rows: Row[]; tone: keyof typeof TONES; personLabel: string; contextLabel: string;
  showCommunities?: boolean; showDamage?: boolean; title: string; subtitle: string;
  icon: React.ReactNode; filename: string;
}) {
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const t = TONES[tone];

  const filtered = useMemo(() => {
    const n = dq.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter((r) =>
      [r.person, r.state, r.lga, r.ward, r.context, r.communities.join(" "), r.batches.join(" "), r.earliestExpiry,
        Object.keys(r.meds).map(medicineLabel).join(" ")]
        .join(" ").toLowerCase().includes(n));
  }, [rows, dq]);

  const totals = useMemo(() => filtered.reduce(
    (a, r) => ({
      total: a.total + r.total, damaged: a.damaged + r.damaged, net: a.net + r.netUsable,
      txns: a.txns + r.txns, atRisk: a.atRisk + r.unitsAtRisk,
    }),
    { total: 0, damaged: 0, net: 0, txns: 0, atRisk: 0 }), [filtered]);

  const toggle = (k: string) => setOpen((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const cols = [
    { key: "person", label: personLabel },
    { key: "context", label: contextLabel },
    { key: "state", label: "State" },
    { key: "lga", label: "LGA" },
    { key: "ward", label: "Ward" },
    ...(showCommunities ? [{ key: "communities", label: "Target communities / settlements" }] : []),
    { key: "batches", label: "Batch / lot no." },
    { key: "expiry", label: "Earliest expiry" },
    { key: "medicines", label: "Medicines (units)" },
    { key: "total", label: "Total units" },
    ...(showDamage ? [{ key: "damaged", label: "Damaged / expired" }, { key: "netUsable", label: "Net usable" }] : []),
    { key: "txns", label: "Transactions" },
    { key: "period", label: "Period" },
  ];

  const exportRows = filtered.map((r) => ({
    person: r.person, context: r.context, state: r.state, lga: r.lga, ward: r.ward,
    communities: r.communities.join("; "),
    batches: r.batches.join("; "),
    expiry: [r.earliestExpiry || "", expiryInfo(r.earliestExpiry).label].filter(Boolean).join(" · "),
    medicines: Object.entries(r.meds).map(([m, v]) => `${medicineLabel(m)}: ${v}`).join("; "),
    total: r.total, damaged: r.damaged, netUsable: r.netUsable, txns: r.txns,
    period: [r.firstDate, r.lastDate].filter(Boolean).join(" → "),
  }));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-4" style={{ background: t.soft }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: t.head }}>{icon}</span>
          <div>
            <h3 className="text-sm font-bold" style={{ color: t.head }}>{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-background">{filtered.length.toLocaleString()} custodians</Badge>
            <Badge variant="outline" className="bg-background">{nf(totals.total)} units</Badge>
            {showDamage && <Badge variant="outline" className="bg-background">{nf(totals.damaged)} damaged</Badge>}
            {totals.atRisk > 0 && (
              <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                <AlertTriangle className="mr-1 h-3 w-3" /> {nf(totals.atRisk)} units near / past expiry
              </Badge>
            )}
            <Button size="sm" variant="outline" className="h-8 bg-background"
              onClick={() => exportCsv(exportRows, cols, null, filename)}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>
        <div className="relative mt-3 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search custodian, LGA, community, medicine..." className="h-9 bg-background pl-8" />
        </div>
      </div>

      <div className="max-h-[62vh] overflow-auto rounded-xl border bg-background">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="text-white" style={{ background: t.head }}>
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2 text-left font-semibold">#</th>
              {cols.map((c) => (
                <th key={c.key} className="min-w-[110px] whitespace-nowrap border-l border-white/10 px-3 py-2 text-left font-semibold">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={cols.length + 2} className="px-4 py-10 text-center text-muted-foreground">No transactions recorded at this level yet.</td></tr>
            ) : filtered.map((r, i) => {
              const expanded = open.has(r.key);
              return (
                <Fragment key={r.key}>
                  <tr
                    className={i % 2 ? "bg-muted/30" : ""}
                    style={rowRisk(r) ? { background: EXPIRY_TONE[rowRisk(r)!].bg, boxShadow: `inset 3px 0 0 ${EXPIRY_TONE[rowRisk(r)!].border}` } : undefined}
                  >
                    <td className="px-2 py-1.5">
                      <button type="button" onClick={() => toggle(r.key)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-white"
                        style={{ background: t.chip }} title={expanded ? "Collapse" : "Medicine breakdown"}>
                        {expanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5 font-semibold text-foreground">{r.person}</td>
                    <td className="px-3 py-1.5">{dash(r.context)}</td>
                    <td className="px-3 py-1.5">{dash(r.state)}</td>
                    <td className="px-3 py-1.5">{dash(r.lga)}</td>
                    <td className="px-3 py-1.5">{dash(r.ward)}</td>
                    {showCommunities && (
                      <td className="max-w-[280px] px-3 py-1.5">
                        {r.communities.length ? (
                          <div className="flex flex-wrap gap-1">
                            {r.communities.slice(0, 4).map((c) => (
                              <span key={c} className="rounded-md border px-1.5 py-0.5 text-[10px] font-medium" style={{ borderColor: t.chip, color: t.chip }}>{c}</span>
                            ))}
                            {r.communities.length > 4 && (
                              <span className="text-[10px] text-muted-foreground">+{r.communities.length - 4} more</span>
                            )}
                          </div>
                        ) : "—"}
                      </td>
                    )}
                    <td className="px-3 py-1.5"><BatchChips batches={r.batches} tone={t.chip} /></td>
                    <td className="px-3 py-1.5"><ExpiryBadge expiry={r.earliestExpiry} unitsAtRisk={r.unitsAtRisk} /></td>
                    <td className="min-w-[220px] px-3 py-1.5"><MedChips meds={r.meds} tone={t.chip} /></td>
                    <td className="px-3 py-1.5 text-right font-bold tabular-nums" style={{ color: t.head }}>{nf(r.total)}</td>
                    {showDamage && <td className="px-3 py-1.5 text-right tabular-nums text-destructive">{nf(r.damaged)}</td>}
                    {showDamage && <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{nf(r.netUsable)}</td>}
                    <td className="px-3 py-1.5 text-center tabular-nums">{r.txns}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                      {r.firstDate || "—"}{r.lastDate && r.lastDate !== r.firstDate ? ` → ${r.lastDate}` : ""}
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={cols.length + 2} className="px-6 py-3" style={{ background: t.soft }}>
                        <div className="mb-2 text-[11px] font-semibold" style={{ color: t.head }}>
                          Medicine-by-medicine breakdown for {r.person}
                          {showCommunities && r.communities.length ? ` · ${r.communities.length} community(ies) served` : ""}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          {Object.entries(r.meds).sort((a, b) => b[1] - a[1]).map(([m, qty]) => {
                            const pct = r.total ? (qty / r.total) * 100 : 0;
                            return (
                              <div key={m} className="rounded-lg border bg-background p-2">
                                <div className="text-[11px] font-semibold text-foreground">{medicineLabel(m)}</div>
                                <div className="text-base font-bold tabular-nums" style={{ color: t.head }}>{nf(qty)}</div>
                                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: t.chip }} />
                                </div>
                                <div className="mt-1 text-[10px] text-muted-foreground">{pct.toFixed(1)}% of this custodian's units</div>
                              </div>
                            );
                          })}
                        </div>
                        {showCommunities && r.communities.length > 0 && (
                          <div className="mt-3">
                            <div className="mb-1 text-[11px] font-semibold" style={{ color: t.head }}>Target communities / settlements</div>
                            <div className="flex flex-wrap gap-1">
                              {r.communities.map((c) => (
                                <span key={c} className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: t.chip }}>{c}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="sticky bottom-0">
              <tr className="font-bold" style={{ background: t.soft, color: t.head }}>
                <td colSpan={showCommunities ? 10 : 9} className="px-3 py-2">Total ({filtered.length} custodians)</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{nf(totals.total)}</td>
                {showDamage && <td className="px-3 py-2 text-right tabular-nums">{nf(totals.damaged)}</td>}
                {showDamage && <td className="px-3 py-2 text-right tabular-nums">{nf(totals.net)}</td>}
                <td className="px-3 py-2 text-center tabular-nums">{totals.txns}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default function CustodianLedgerTables({ dataset }: { dataset: LogisticsDataset }) {
  const rows = useMemo(() => buildRows(dataset), [dataset]);
  const stampDate = new Date().toISOString().slice(0, 10);

  return (
    <Tabs defaultValue="edo" className="space-y-3">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="edo" className="text-xs"><Warehouse className="mr-1 h-3.5 w-3.5" /> State → LGA EDO</TabsTrigger>
        <TabsTrigger value="flhf" className="text-xs"><Truck className="mr-1 h-3.5 w-3.5" /> LGA EDO → FLHF worker</TabsTrigger>
        <TabsTrigger value="cdd" className="text-xs"><Users className="mr-1 h-3.5 w-3.5" /> FLHF worker → CDD</TabsTrigger>
        <TabsTrigger value="recon" className="text-xs"><Scale className="mr-1 h-3.5 w-3.5" /> Inventory reconciliation</TabsTrigger>
      </TabsList>

      <TabsContent value="edo">
        <LedgerTable
          rows={rows.edo} tone="edo" personLabel="LGA EDO / Logistic Officer" contextLabel="Received from (State Logistic Officer)"
          showDamage title="Quantity of medicines received by each LGA EDO / Logistic Officer"
          subtitle="Level 1 register — State medical store consignments acknowledged at LGA level, with damaged and net-usable reconciliation."
          icon={<Warehouse className="h-4 w-4" />} filename={`EDO_Receipts_${stampDate}.csv`}
        />
      </TabsContent>

      <TabsContent value="flhf">
        <LedgerTable
          rows={rows.flhf} tone="flhf" personLabel="FLHF health worker (in-charge)" contextLabel="Issued by (LGA EDO / Logistic Officer)"
          title="Quantity of medicines issued to each FLHF health worker"
          subtitle="Level 2 register — LGA store issues to front-line health facilities, attributed to the receiving facility in-charge."
          icon={<UserCog className="h-4 w-4" />} filename={`FLHF_Issues_${stampDate}.csv`}
        />
      </TabsContent>

      <TabsContent value="cdd">
        <LedgerTable
          rows={rows.cdd} tone="cdd" personLabel="Community-Directed Distributor (CDD)" contextLabel="Issued by (FLHF · health worker)"
          showCommunities title="Quantity of medicines issued to each CDD, by target community / settlement"
          subtitle="Level 3 register — facility-to-CDD issues with the exact communities and settlements each consignment was given for."
          icon={<Users className="h-4 w-4" />} filename={`CDD_Issues_${stampDate}.csv`}
        />
      </TabsContent>
      <TabsContent value="recon">
        <InventoryReconciliationView dataset={dataset} />
      </TabsContent>
    </Tabs>
  );
}
