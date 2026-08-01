/**
 * Universal Kobo Hub — repeat-group sub-dashboard.
 * Shows repeat volume per submission plus the flattened child-level table.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Layers } from "lucide-react";
import { downloadCsv, repeatBlockRows, type Row } from "@/lib/koboHub/analytics";
import { findRepeatArray, type HubRepeatBlock, type HubSchema } from "@/lib/koboHub/schema";

interface Props {
  rows: Row[];
  schema: HubSchema;
  canExport: boolean;
}

export default function HubRepeats({ rows, schema, canExport }: Props) {
  const [active, setActive] = useState(schema.repeats[0]?.name ?? "");
  if (!schema.repeats.length) {
    return (
      <Card className="bg-slate-900/70 border-slate-800">
        <CardContent className="p-8 text-center text-slate-400 text-sm">
          This form has no repeat groups. Child-level analysis becomes available automatically
          when the Kobo form contains a <code className="text-cyan-400">begin_repeat</code> block.
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs value={active} onValueChange={setActive} className="space-y-4">
      <TabsList className="bg-slate-900 border border-slate-800 flex-wrap h-auto">
        {schema.repeats.map((r) => (
          <TabsTrigger key={r.name} value={r.name}
            className="text-slate-300 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-200">
            {r.label || r.leaf}
          </TabsTrigger>
        ))}
      </TabsList>
      {schema.repeats.map((r) => (
        <TabsContent key={r.name} value={r.name}>
          <RepeatBlockPanel rows={rows} block={r} canExport={canExport} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function RepeatBlockPanel({ rows, block, canExport }: { rows: Row[]; block: HubRepeatBlock; canExport: boolean }) {
  const flat = useMemo(() => repeatBlockRows(rows, block), [rows, block]);
  const counts = useMemo(() => rows.map((r) => findRepeatArray(r, block.name).length), [rows, block]);
  const total = counts.reduce((a, b) => a + b, 0);
  const avg = counts.length ? total / counts.length : 0;
  const max = counts.length ? Math.max(...counts) : 0;
  const withNone = counts.filter((c) => c === 0).length;

  const columns = useMemo(() => {
    const keys = new Set<string>();
    flat.slice(0, 200).forEach((r) => Object.keys(r).forEach((k) => { if (!k.startsWith("_")) keys.add(k); }));
    return [...keys].slice(0, 14);
  }, [flat]);

  const stat = (label: string, value: string, tone: string) => (
    <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {stat("Total child rows", total.toLocaleString(), "text-emerald-400")}
        {stat("Avg per submission", avg.toFixed(2), "text-cyan-400")}
        {stat("Max in one submission", String(max), "text-amber-400")}
        {stat("Submissions with none", String(withNone), withNone ? "text-red-400" : "text-slate-200")}
      </div>

      <Card className="bg-slate-900/70 border-slate-800">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-100">
            <Layers className="h-4 w-4 text-cyan-400" /> Flattened {block.label || block.leaf} rows
            <Badge variant="outline" className="border-slate-700 text-slate-400">{flat.length}</Badge>
          </CardTitle>
          {canExport && (
            <Button size="sm" variant="outline" className="border-slate-700 text-slate-200"
              onClick={() => downloadCsv(`repeat-${block.leaf}`, flat)}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[460px] rounded border border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-800 text-slate-300">
                <tr>
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Parent UUID</th>
                  {columns.map((c) => <th key={c} className="px-2 py-2 text-left whitespace-nowrap">{c.split("/").pop()}</th>)}
                </tr>
              </thead>
              <tbody>
                {flat.slice(0, 500).map((r, i) => (
                  <tr key={`${r.parent_uuid}-${i}`} className="border-t border-slate-800 text-slate-300 hover:bg-slate-800/50">
                    <td className="px-2 py-1.5">{String(r.index)}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">{String(r.parent_uuid).slice(0, 12)}…</td>
                    {columns.map((c) => (
                      <td key={c} className="px-2 py-1.5 whitespace-nowrap max-w-[220px] truncate">{String((r as any)[c] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {flat.length > 500 && (
            <p className="mt-2 text-[11px] text-slate-500">Showing first 500 of {flat.length} rows — export CSV for the full set.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
