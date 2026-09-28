import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Boxes, Building2, ChevronDown, ChevronRight, Database, FolderTree, Gauge, Layers, ListTree, Search, Server, ShieldCheck, Tags, Workflow } from "lucide-react";

export type ExplorerSchema = {
  system: { name: string | null; version: string | null; serverDate?: string | null; lastAnalytics?: string | null; calendar?: string | null };
  user?: { username: string | null; displayName: string | null; roles: string[]; orgUnits: { id: string; name: string; level: number }[] };
  dataSets: { id: string; name: string; periodType: string; elementCount: number; elementIds?: string[]; orgUnitCount?: number | null; categoryCombo?: string | null; timelyDays?: number | null }[];
  elements: any[];
  levels: { level: number; name: string }[];
  programs?: { id: string; name: string; programType: string; trackedEntityType: string | null; stages: string[] }[];
  categoryCombos?: { id: string; name: string; type: string; categories: string[]; cocCount: number }[];
  dataElementGroups?: { id: string; name: string; size: number }[];
  indicatorGroups?: { id: string; name: string; size: number }[];
  orgUnitGroups?: { id: string; name: string; size: number }[];
  counts: Record<string, number>;
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const PAGE = 150;

function Stat({ icon: Icon, label, value, hint }: { icon: any; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 flex items-start gap-3">
      <span className="rounded-md bg-primary/10 p-2"><Icon className="h-4 w-4 text-primary" strokeWidth={1.5} /></span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className="text-base font-semibold truncate">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground truncate">{hint}</p>}
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative max-w-sm">
      <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 pl-8 text-xs" />
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">{children}</span>;
}

function GroupList({ items, empty }: { items: { id: string; name: string; size: number }[]; empty: string }) {
  if (!items.length) return <p className="text-xs text-muted-foreground p-3">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.size));
  return (
    <div className="divide-y divide-border/60">
      {items.slice().sort((a, b) => b.size - a.size).map((g) => (
        <div key={g.id} className="flex items-center gap-3 px-3 py-2">
          <p className="text-xs flex-1 truncate">{g.name}</p>
          <div className="w-28 h-1.5 rounded bg-muted overflow-hidden"><div className="h-full bg-primary/70" style={{ width: `${(g.size / max) * 100}%` }} /></div>
          <span className="text-[11px] font-mono w-12 text-right text-muted-foreground">{g.size}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dhis2SchemaExplorer({ schema }: { schema: ExplorerSchema }) {
  const [q, setQ] = useState("");
  const [openSet, setOpenSet] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const f = q.trim().toLowerCase();
  const byId = useMemo(() => new Map(schema.elements.map((e) => [e.id, e])), [schema]);
  const des = useMemo(() => schema.elements.filter((e) => e.kind === "dataElement"), [schema]);
  const inds = useMemo(() => schema.elements.filter((e) => e.kind === "indicator"), [schema]);
  const match = (...xs: unknown[]) => !f || xs.some((x) => String(x ?? "").toLowerCase().includes(f));
  const periodMix = useMemo(() => {
    const m = new Map<string, number>();
    schema.dataSets.forEach((d) => m.set(d.periodType, (m.get(d.periodType) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [schema]);

  const tabs = [
    ["overview", "Overview", Gauge], ["sets", `Data sets (${schema.dataSets.length})`, Database],
    ["elements", `Data elements (${des.length})`, Boxes], ["indicators", `Indicators (${inds.length})`, Tags],
    ["programs", `Programs (${schema.programs?.length ?? 0})`, Workflow], ["disagg", "Disaggregations", Layers],
    ["org", "Hierarchy", FolderTree],
  ] as const;

  return (
    <Tabs defaultValue="overview" onValueChange={() => { setQ(""); setLimit(PAGE); }}>
      <TabsList className="flex flex-wrap h-auto justify-start">
        {tabs.map(([v, l, I]) => <TabsTrigger key={v} value={v} className="text-xs"><I className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} />{l}</TabsTrigger>)}
      </TabsList>

      <TabsContent value="overview" className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Stat icon={Server} label="Instance" value={schema.system.name ?? "DHIS2"} hint={`Version ${schema.system.version ?? "?"}${schema.system.calendar ? ` · ${schema.system.calendar} calendar` : ""}`} />
          <Stat icon={ShieldCheck} label="Signed in as" value={schema.user?.displayName ?? schema.user?.username ?? "—"} hint={schema.user?.roles?.slice(0, 3).join(", ")} />
          <Stat icon={Gauge} label="Analytics refreshed" value={fmt(schema.system.lastAnalytics)} hint={`Server time ${fmt(schema.system.serverDate)}`} />
          <Stat icon={Building2} label="Your locations" value={schema.user?.orgUnits?.length ?? 0} hint={schema.user?.orgUnits?.map((o) => o.name).slice(0, 3).join(", ")} />
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          {[["Data sets", schema.counts.dataSets], ["Data elements", schema.counts.dataElements], ["Indicators", schema.counts.indicators],
            ["Programs", schema.counts.programs], ["Category combos", schema.counts.categoryCombos ?? 0], ["Location groups", schema.counts.orgUnitGroups ?? 0]].map(([l, v]) => (
            <div key={String(l)} className="rounded-lg border border-border/60 p-2.5 text-center">
              <p className="text-lg font-semibold font-mono">{Number(v ?? 0).toLocaleString()}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{l}</p>
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/60">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground px-3 pt-3">Reporting frequency</p>
            <GroupList items={periodMix.map(([k, v]) => ({ id: k, name: k, size: v }))} empty="No data sets" />
          </div>
          <div className="rounded-lg border border-border/60">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground px-3 pt-3">Data element groups</p>
            <div className="max-h-56 overflow-y-auto"><GroupList items={schema.dataElementGroups ?? []} empty="No groups defined" /></div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="sets" className="space-y-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search data sets…" />
        <div className="rounded-lg border border-border/60 divide-y divide-border/60 max-h-[55dvh] overflow-y-auto">
          {schema.dataSets.filter((d) => match(d.name, d.periodType)).map((d) => {
            const isOpen = openSet === d.id;
            return (
              <div key={d.id}>
                <button type="button" onClick={() => setOpenSet(isOpen ? null : d.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <span className="text-sm flex-1 truncate">{d.name}</span>
                  <Chip>{d.periodType}</Chip><Chip>{d.elementCount} elements</Chip>
                  {d.orgUnitCount != null && <Chip>{d.orgUnitCount} locations</Chip>}
                </button>
                {isOpen && (
                  <div className="bg-muted/20 px-9 py-2 space-y-1">
                    <p className="text-[11px] text-muted-foreground font-mono">{d.id}{d.categoryCombo ? ` · attribute: ${d.categoryCombo}` : ""}{d.timelyDays != null ? ` · timely within ${d.timelyDays} days` : ""}</p>
                    {(d.elementIds ?? []).map((id) => { const e = byId.get(id); return e ? (
                      <div key={id} className="flex items-center gap-2 text-xs py-0.5">
                        <span className="flex-1 truncate">{e.name}</span>
                        {e.valueType && <Chip>{e.valueType}</Chip>}
                        <Chip>{(e.categoryOptionCombos ?? []).length} disaggs</Chip>
                      </div>) : null; })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </TabsContent>

      <TabsContent value="elements" className="space-y-2">
        <SearchBox value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} placeholder="Search by name, code or ID…" />
        {(() => { const rows = des.filter((e) => match(e.name, e.code, e.id, e.shortName)); return (<>
          <div className="rounded-lg border border-border/60 max-h-[55dvh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card"><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="p-2">Name</th><th className="p-2">ID</th><th className="p-2">Value type</th><th className="p-2">Aggregation</th><th className="p-2">Disaggregation</th></tr></thead>
              <tbody>{rows.slice(0, limit).map((e) => (
                <tr key={e.id} className="border-t border-border/60 hover:bg-muted/40">
                  <td className="p-2">{e.name}</td><td className="p-2 font-mono text-muted-foreground">{e.id}</td>
                  <td className="p-2">{e.valueType ?? "—"}</td><td className="p-2">{e.aggregationType ?? "—"}</td>
                  <td className="p-2" title={(e.categoryOptionCombos ?? []).map((c: any) => c.name).join(", ")}>{e.categoryCombo ?? "default"} · {(e.categoryOptionCombos ?? []).length}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">Showing {Math.min(limit, rows.length)} of {rows.length}{rows.length > limit && <button type="button" className="ml-2 text-primary underline" onClick={() => setLimit((l) => l + PAGE)}>Show more</button>}</p>
        </>); })()}
      </TabsContent>

      <TabsContent value="indicators" className="space-y-2">
        <SearchBox value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} placeholder="Search indicators or groups…" />
        {(() => { const rows = inds.filter((e) => match(e.name, e.code, e.id, e.indicatorType, ...(e.groups ?? []))); return (<>
          <div className="grid md:grid-cols-2 gap-2 max-h-[55dvh] overflow-y-auto">
            {rows.slice(0, limit).map((e) => (
              <div key={e.id} className="rounded-lg border border-border/60 p-2.5 space-y-1">
                <div className="flex items-start gap-2"><p className="text-sm font-medium flex-1">{e.name}</p>{e.indicatorType && <Chip>{e.indicatorType}</Chip>}</div>
                {(e.numerator || e.denominator) && <p className="text-[11px] text-muted-foreground"><span className="font-semibold">N:</span> {e.numerator ?? "—"} <span className="font-semibold ml-1">D:</span> {e.denominator ?? "—"}</p>}
                <div className="flex flex-wrap gap-1">{(e.groups ?? []).slice(0, 4).map((g: string) => <Chip key={g}>{g}</Chip>)}<span className="text-[10px] font-mono text-muted-foreground ml-auto">{e.id}</span></div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Showing {Math.min(limit, rows.length)} of {rows.length}{rows.length > limit && <button type="button" className="ml-2 text-primary underline" onClick={() => setLimit((l) => l + PAGE)}>Show more</button>}</p>
        </>); })()}
      </TabsContent>

      <TabsContent value="programs" className="space-y-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search programs…" />
        <div className="grid md:grid-cols-2 gap-2 max-h-[55dvh] overflow-y-auto">
          {(schema.programs ?? []).filter((p) => match(p.name, p.trackedEntityType)).map((p) => (
            <div key={p.id} className="rounded-lg border border-border/60 p-2.5 space-y-1">
              <div className="flex items-start gap-2"><p className="text-sm font-medium flex-1">{p.name}</p><Chip>{p.programType === "WITH_REGISTRATION" ? "Tracker" : "Event"}</Chip></div>
              {p.trackedEntityType && <p className="text-[11px] text-muted-foreground">Tracks: {p.trackedEntityType}</p>}
              <div className="flex flex-wrap gap-1">{p.stages.map((s) => <Chip key={s}>{s}</Chip>)}</div>
            </div>
          ))}
          {!schema.programs?.length && <p className="text-xs text-muted-foreground">No programs visible to this account.</p>}
        </div>
      </TabsContent>

      <TabsContent value="disagg" className="space-y-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search category combinations…" />
        <div className="rounded-lg border border-border/60 divide-y divide-border/60 max-h-[55dvh] overflow-y-auto">
          {(schema.categoryCombos ?? []).filter((c) => match(c.name, ...c.categories)).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <ListTree className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
              <span className="text-xs font-medium flex-1 min-w-[160px]">{c.name}</span>
              {c.categories.map((x) => <Chip key={x}>{x}</Chip>)}
              <span className="text-[11px] font-mono text-muted-foreground">{c.cocCount} options · {c.type === "ATTRIBUTE" ? "attribute" : "disaggregation"}</span>
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="org" className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {schema.levels.map((l, i) => (
            <div key={l.level} className="flex items-center gap-1.5">
              <div className="rounded-lg border border-border/60 px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Level {l.level}</p>
                <p className="text-sm font-medium">{l.name}</p>
              </div>
              {i < schema.levels.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/60">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground px-3 pt-3">Locations you can report for</p>
            <div className="divide-y divide-border/60">{(schema.user?.orgUnits ?? []).map((o) => (
              <div key={o.id} className="flex items-center gap-2 px-3 py-2 text-xs"><Building2 className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} /><span className="flex-1">{o.name}</span><Chip>level {o.level}</Chip></div>))}</div>
          </div>
          <div className="rounded-lg border border-border/60">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground px-3 pt-3">Location groups</p>
            <div className="max-h-56 overflow-y-auto"><GroupList items={schema.orgUnitGroups ?? []} empty="No location groups" /></div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
