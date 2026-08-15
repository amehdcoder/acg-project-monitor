/**
 * Universal Kobo Analytics — Raw Kobo Data explorer.
 * Parent submissions plus every repeat group, perfectly flattened, searchable,
 * paginated and exportable — mirroring the Integrated Supervisory Checklist.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import {
  flattenRepeats, getFlat, resolveValue,
  type HubField, type HubSchema,
} from "@/lib/koboHub/schema";

const PAGE = 25;
const META: HubField[] = [
  { name: "_id", leaf: "_id", label: "Kobo ID", type: "text", group: "" } as HubField,
  { name: "_submission_time", leaf: "_submission_time", label: "Submitted", type: "datetime", group: "" } as HubField,
  { name: "_submitted_by", leaf: "_submitted_by", label: "Submitted by", type: "text", group: "" } as HubField,
];

function csv(rows: Record<string, unknown>[], headers: { key: string; label: string }[], name: string) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [
    headers.map((h) => esc(h.label)).join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h.key])).join(",")),
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  a.download = `${name.replace(/[^\w.-]+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function DataTable({
  title, rows, fields, schema,
}: { title: string; rows: Record<string, unknown>[]; fields: HubField[]; schema: HubSchema }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const display = useMemo(
    () => rows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const f of fields) o[f.name] = resolveValue(schema, f, getFlat(r, f.name));
      return o;
    }),
    [rows, fields, schema],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return display;
    return display.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(s)));
  }, [display, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const p = Math.min(page, pages - 1);
  const slice = filtered.slice(p * PAGE, p * PAGE + PAGE);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder={`Search ${title.toLowerCase()}…`} className="pl-8 bg-slate-950 border-slate-700" />
        </div>
        <Badge variant="outline" className="border-slate-700 text-slate-300">{filtered.length.toLocaleString()} rows</Badge>
        <Button size="sm" variant="outline" className="border-slate-700 text-slate-200"
          onClick={() => csv(filtered, fields.map((f) => ({ key: f.name, label: f.label || f.leaf })), title)}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
        </Button>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              {fields.map((f) => (
                <th key={f.name} className="whitespace-nowrap p-2 text-left font-medium">{f.label || f.leaf}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/40">
                {fields.map((f) => (
                  <td key={f.name} className="max-w-[280px] truncate p-2 text-slate-200" title={String(r[f.name] ?? "")}>
                    {String(r[f.name] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
            {!slice.length && (
              <tr><td colSpan={fields.length} className="p-6 text-center text-slate-500">No records match this search.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Page {p + 1} of {pages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="border-slate-700 text-slate-200" disabled={p === 0} onClick={() => setPage(p - 1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="border-slate-700 text-slate-200" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function HubRawData({ rows, schema }: { rows: Record<string, unknown>[]; schema: HubSchema }) {
  const parentFields = useMemo(
    () => [...META, ...schema.fields.filter((f) => !["note"].includes(f.type))],
    [schema],
  );

  return (
    <Tabs defaultValue="parent" className="space-y-4">
      <TabsList className="h-auto flex-wrap border border-slate-800 bg-slate-900">
        <TabsTrigger value="parent" className="text-slate-300 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-200">
          Submissions
        </TabsTrigger>
        {schema.repeats.map((r) => (
          <TabsTrigger key={r.name} value={r.name} className="text-slate-300 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-200">
            {r.label || r.leaf}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="parent">
        <DataTable title="Kobo submissions" rows={rows} fields={parentFields} schema={schema} />
      </TabsContent>

      {schema.repeats.map((rep) => {
        const flat = flattenRepeats(rows as any[], rep);
        const fields: HubField[] = [
          { name: "__parentId", leaf: "__parentId", label: "Parent ID", type: "text", group: "" } as HubField,
          { name: "__index", leaf: "__index", label: "#", type: "integer", group: "" } as HubField,
          { name: "_submission_time", leaf: "_submission_time", label: "Submitted", type: "datetime", group: "" } as HubField,
          ...rep.fields,
        ];
        return (
          <TabsContent key={rep.name} value={rep.name}>
            <DataTable title={rep.label || rep.leaf} rows={flat} fields={fields} schema={schema} />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
