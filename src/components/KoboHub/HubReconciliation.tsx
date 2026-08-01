/**
 * Universal Kobo Hub — automated reconciliation report.
 * Raw Kobo API counts vs locally stored submissions and flattened child rows,
 * with duplicate/orphan/geography flags and CSV export.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Download, GitCompareArrows, Info } from "lucide-react";
import { downloadCsv, reconcile, integrityScan, type Row } from "@/lib/koboHub/analytics";
import type { HubSchema } from "@/lib/koboHub/schema";

interface Props {
  rows: Row[];
  schema: HubSchema;
  apiCount: number;
  canExport: boolean;
}

const TONE = {
  critical: { cls: "text-red-400 border-red-500/40 bg-red-500/10", Icon: AlertTriangle },
  warning: { cls: "text-amber-400 border-amber-500/40 bg-amber-500/10", Icon: AlertTriangle },
  info: { cls: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10", Icon: CheckCircle2 },
} as const;

export default function HubReconciliation({ rows, schema, apiCount, canExport }: Props) {
  const { summary, parentCount, childCount } = useMemo(
    () => reconcile(rows, schema, apiCount), [rows, schema, apiCount],
  );
  const integrity = useMemo(() => integrityScan(rows, schema), [rows, schema]);

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/70 border-slate-800">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-100">
            <GitCompareArrows className="h-4 w-4 text-cyan-400" /> Reconciliation report
          </CardTitle>
          {canExport && (
            <Button size="sm" variant="outline" className="border-slate-700 text-slate-200"
              onClick={() => downloadCsv("kobo-hub-reconciliation", summary as any)}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 grid-cols-3">
            {[["Kobo API count", apiCount], ["Stored submissions", parentCount], ["Flattened child rows", childCount]].map(([l, v]) => (
              <div key={String(l)} className="rounded-md border border-slate-800 bg-slate-900 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">{l}</div>
                <div className="text-lg font-semibold text-slate-100">{Number(v).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {summary.map((r) => {
              const t = TONE[r.severity];
              return (
                <div key={r.issue} className={`flex items-start gap-3 rounded-md border p-3 ${t.cls}`}>
                  <t.Icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{r.issue} <span className="opacity-70">· {r.count}</span></div>
                    <div className="text-xs text-slate-400">{r.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/70 border-slate-800">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-100">
            <Info className="h-4 w-4 text-cyan-400" /> Data integrity findings
            <Badge variant="outline" className="border-slate-700 text-slate-400">score {integrity.score}/100</Badge>
          </CardTitle>
          {canExport && integrity.issues.length > 0 && (
            <Button size="sm" variant="outline" className="border-slate-700 text-slate-200"
              onClick={() => downloadCsv("kobo-hub-integrity", integrity.issues as any)}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {integrity.issues.length === 0 ? (
            <p className="text-sm text-emerald-400">No anomalies detected across {integrity.checked} submissions.</p>
          ) : (
            <div className="overflow-auto max-h-[380px] rounded border border-slate-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-2 py-2 text-left">Severity</th>
                    <th className="px-2 py-2 text-left">Type</th>
                    <th className="px-2 py-2 text-left">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {integrity.issues.map((i, idx) => (
                    <tr key={`${i.id}-${idx}`} className="border-t border-slate-800 text-slate-300">
                      <td className="px-2 py-1.5">
                        <span className={i.severity === "critical" ? "text-red-400" : "text-amber-400"}>{i.severity}</span>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{i.kind}</td>
                      <td className="px-2 py-1.5">{i.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
