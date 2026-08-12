/**
 * Raw medicine-logistics responses, split into the four cascade levels of the
 * "MDA Medicine Logistics / Accountability" XLSForm. Each level is a flat,
 * exportable table of the normalised transaction rows.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileSpreadsheet, ScanLine, Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { parseLogistics, medicineLabel, returnLegLabel, returnConditionLabel } from "@/lib/isc/medicineAccountability";
import { exportCsv, exportXlsx } from "./exportKoboData";
import type { KoboCache } from "./koboClient";

type Col = { key: string; label: string };

const COMMON: Col[] = [
  { key: "date", label: "Transaction date" },
  { key: "state", label: "State" },
  { key: "lga", label: "LGA" },
  { key: "ward", label: "Ward" },
];

const LEVELS: { id: string; label: string; source: "dispatches" | "receipts" | "issues" | "cddIssues" | "returns"; cols: Col[] }[] = [
  {
    id: "l0", label: "Level 0 · State → LGA", source: "dispatches",
    cols: [...COMMON,
      { key: "medicineLabel", label: "Medicine" },
      { key: "batch", label: "Batch / Lot" },
      { key: "expiry", label: "Expiry" },
      { key: "qtyDispatched", label: "Qty issued to LGA" },
      { key: "destinationLga", label: "Destination LGA" },
      { key: "sloName", label: "State Logistic Officer" },
      { key: "barcode", label: "Barcode / QR" },
    ],
  },
  {
    id: "l1", label: "Level 1 · LGA receipt", source: "receipts",
    cols: [...COMMON,
      { key: "medicineLabel", label: "Medicine" },
      { key: "batch", label: "Batch / Lot" },
      { key: "expiry", label: "Expiry" },
      { key: "qtyReceived", label: "Qty received" },
      { key: "qtyDamaged", label: "Damaged / expired" },
      { key: "netUsable", label: "Net usable" },
      { key: "edoName", label: "EDO / Logistic Officer" },
      { key: "barcode", label: "Barcode / QR" },
    ],
  },
  {
    id: "l2", label: "Level 2 · LGA → Health facility", source: "issues",
    cols: [...COMMON,
      { key: "facility", label: "Health facility" },
      { key: "inCharge", label: "Facility in-charge" },
      { key: "medicineLabel", label: "Medicine" },
      { key: "batch", label: "Batch / Lot" },
      { key: "priorBalance", label: "LGA balance before" },
      { key: "qtyIssued", label: "Qty issued" },
      { key: "remainingLga", label: "LGA balance after" },
    ],
  },
  {
    id: "l3", label: "Level 3 · Facility → CDD", source: "cddIssues",
    cols: [...COMMON,
      { key: "facility", label: "Health facility" },
      { key: "community", label: "Community / settlement" },
      { key: "cddName", label: "CDD" },
      { key: "medicineLabel", label: "Medicine" },
      { key: "qtyIssued", label: "Qty issued to CDD" },
    ],
  },
  {
    id: "l4", label: "Level 4 · Return / reverse logistics", source: "returns",
    cols: [...COMMON,
      { key: "legLabel", label: "Return leg" },
      { key: "returnedFrom", label: "Returned from" },
      { key: "returnedTo", label: "Returned to" },
      { key: "facility", label: "Health facility" },
      { key: "community", label: "Community / settlement" },
      { key: "medicineLabel", label: "Medicine" },
      { key: "batch", label: "Batch / Lot" },
      { key: "expiry", label: "Expiry" },
      { key: "qtyReturned", label: "Qty returned" },
      { key: "qtyUsable", label: "Usable" },
      { key: "qtyDamaged", label: "Damaged" },
      { key: "qtyExpired", label: "Expired" },
      { key: "conditionLabel", label: "Condition" },
      { key: "reason", label: "Reason for return" },
      { key: "returnedBy", label: "Returned by" },
      { key: "receivedBy", label: "Received by" },
      { key: "waybill", label: "Return waybill" },
      { key: "proof", label: "Proof of return" },
      { key: "barcode", label: "Barcode / QR" },
    ],
  },
];

const cell = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v));

export default function MedicineRawLevelTables({ cache }: { cache: KoboCache | null }) {
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);

  const ds = useMemo(() => parseLogistics(cache?.results ?? []), [cache]);

  const enrich = (rows: any[]) =>
    rows.map((r) => ({
      ...r,
      medicineLabel: r.medicine ? medicineLabel(r.medicine) : "—",
      legLabel: r.leg ? returnLegLabel(r.leg) : undefined,
      conditionLabel: r.condition ? returnConditionLabel(r.condition) : undefined,
      proof: r.level === "level_4"
        ? [r.hasSignature && "Signature", r.hasWaybill && "Waybill", r.hasPhoto && "Photo"]
            .filter(Boolean).join(" · ") || "None"
        : undefined,
    }));

  const stamp = new Date().toISOString().slice(0, 10);

  if (!cache) {
    return (
      <div className="rounded-lg border bg-background py-12 text-center text-sm text-muted-foreground">
        Link the medicine logistics KoboToolbox form to see its raw responses here.
      </div>
    );
  }

  return (
    <Tabs defaultValue="l0" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TabsList className="h-auto flex-wrap">
          {LEVELS.map((l) => (
            <TabsTrigger key={l.id} value={l.id} className="text-xs">{l.label}</TabsTrigger>
          ))}
        </TabsList>
        <div className="relative ml-auto min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions..." className="h-9 pl-8" />
        </div>
      </div>

      {LEVELS.map((l) => {
        const rows = enrich((ds as any)[l.source] as any[]);
        const needle = dq.trim().toLowerCase();
        const filtered = needle
          ? rows.filter((r) => l.cols.map((c) => cell(r[c.key])).join(" ").toLowerCase().includes(needle))
          : rows;
        const exportRows = filtered.map((r) => {
          const o: Record<string, unknown> = {};
          for (const c of l.cols) o[c.key] = r[c.key] ?? "";
          return o;
        });
        const scanned = filtered.filter((r) => !!r.barcode).length;
        return (
          <TabsContent key={l.id} value={l.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{filtered.length.toLocaleString()} transactions</Badge>
              {l.cols.some((c) => c.key === "barcode") && (
                <Badge variant="outline" className="gap-1">
                  <ScanLine className="h-3 w-3" /> {scanned.toLocaleString()} barcode-scanned
                </Badge>
              )}
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" className="h-8"
                  onClick={() => exportXlsx(exportRows, l.cols, null, `Medicine_${l.id}_${stamp}.xlsx`)}>
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Excel
                </Button>
                <Button size="sm" variant="outline" className="h-8"
                  onClick={() => exportCsv(exportRows, l.cols, null, `Medicine_${l.id}_${stamp}.csv`)}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
                </Button>
              </div>
            </div>
            <div className="max-h-[65vh] overflow-auto rounded-lg border bg-background">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[hsl(214,60%,18%)] text-white">
                    {l.cols.map((c) => (
                      <th key={c.key} className="min-w-[130px] whitespace-nowrap border-r border-white/10 px-3 py-2 text-left font-semibold">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={l.cols.length} className="px-4 py-10 text-center text-muted-foreground">No transactions recorded at this level yet.</td></tr>
                  ) : filtered.map((r, i) => (
                    <tr key={i} className={i % 2 ? "bg-muted/30" : ""}>
                      {l.cols.map((c) => (
                        <td key={c.key} className="min-w-[130px] max-w-[260px] truncate border-t px-3 py-1.5 align-top" title={cell(r[c.key])}>
                          {cell(r[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
