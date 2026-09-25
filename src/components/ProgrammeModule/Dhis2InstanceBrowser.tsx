import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, Loader2, MapPin, RefreshCw, Search, Server, Database, CheckCircle2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  browseDhis2, dhis2Children, dhis2SearchUnits,
  type Dhis2Catalog, type Dhis2OrgUnit, type ExchangeConnection,
} from "@/lib/programmeModule/healthExchange";

interface Props {
  connection: ExchangeConnection;
  canManage?: boolean;
  onCatalog: (catalog: Dhis2Catalog | null) => void;
  onSaveTarget: (patch: { org_unit_id?: string; dataset_id?: string }) => Promise<void>;
}

/** Live view of the connected DHIS2 instance: pick where and what to report to. */
export default function Dhis2InstanceBrowser({ connection, canManage, onCatalog, onSaveTarget }: Props) {
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<Dhis2Catalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trail, setTrail] = useState<Dhis2OrgUnit[]>([]);
  const [units, setUnits] = useState<Dhis2OrgUnit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [deFilter, setDeFilter] = useState("");
  const [unitNames, setUnitNames] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const c = await browseDhis2(connection.id);
      setCatalog(c); onCatalog(c); setTrail([]); setUnits(c.roots);
      setUnitNames((n) => ({ ...n, ...Object.fromEntries(c.roots.map((r) => [r.id, r.name])) }));
    } catch (e: any) {
      setError(e.message); onCatalog(null);
    } finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCatalog(null); onCatalog(null); void load(); }, [connection.id]);

  const openUnit = async (u: Dhis2OrgUnit, newTrail: Dhis2OrgUnit[]) => {
    setUnitsLoading(true);
    try {
      const r = await dhis2Children(connection.id, u.id);
      setTrail(newTrail); setUnits(r.orgUnits);
      setUnitNames((n) => ({ ...n, ...Object.fromEntries(r.orgUnits.map((x) => [x.id, x.name])) }));
    } catch (e: any) { toast({ title: "Could not open location", description: e.message, variant: "destructive" }); }
    finally { setUnitsLoading(false); }
  };

  const search = async () => {
    if (query.trim().length < 2) return;
    setUnitsLoading(true);
    try {
      const r = await dhis2SearchUnits(connection.id, query.trim());
      setTrail([]); setUnits(r.orgUnits);
      setUnitNames((n) => ({ ...n, ...Object.fromEntries(r.orgUnits.map((x) => [x.id, x.name])) }));
    } catch (e: any) { toast({ title: "Search failed", description: e.message, variant: "destructive" }); }
    finally { setUnitsLoading(false); }
  };

  const selectedSet = useMemo(
    () => catalog?.dataSets.find((d) => d.id === connection.dataset_id) ?? null,
    [catalog, connection.dataset_id],
  );
  const elements = useMemo(() => {
    const list = selectedSet?.dataElements ?? [];
    const f = deFilter.trim().toLowerCase();
    return f ? list.filter((e) => e.name.toLowerCase().includes(f) || e.id.toLowerCase().includes(f)) : list;
  }, [selectedSet, deFilter]);

  const pick = async (patch: { org_unit_id?: string; dataset_id?: string }, label: string) => {
    try { await onSaveTarget(patch); toast({ title: label }); }
    catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Server className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{catalog?.system.name || "DHIS2 instance"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {connection.base_url}
            {catalog?.system.version && ` · v${catalog.system.version}`}
            {catalog?.user.displayName && ` · signed in as ${catalog.user.displayName}`}
          </p>
        </div>
        {catalog && <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Live</Badge>}
        {error && <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" /> Unreachable</Badge>}
        <Button size="sm" variant="outline" className="gap-1" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
        </Button>
      </div>

      {error && <p className="p-4 text-sm text-destructive">{error}</p>}
      {loading && !catalog && <p className="p-4 text-sm text-muted-foreground">Connecting to the DHIS2 server…</p>}

      {catalog && (
        <div className="grid gap-0 md:grid-cols-2">
          {/* Locations */}
          <div className="space-y-3 border-b p-4 md:border-b-0 md:border-r">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" /> Reporting location</p>
              {connection.org_unit_id && (
                <Badge variant="outline" className="max-w-[60%] truncate">{unitNames[connection.org_unit_id] ?? connection.org_unit_id}</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Input className="h-9" placeholder="Search State, LGA, ward or facility" value={query}
                onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} />
              <Button size="sm" variant="outline" onClick={() => void search()}><Search className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <button className="hover:text-foreground" onClick={() => { setTrail([]); setUnits(catalog.roots); }}>Your access</button>
              {trail.map((t, i) => (
                <span key={t.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  <button className="hover:text-foreground" onClick={() => void openUnit(t, trail.slice(0, i + 1))}>{t.name}</button>
                </span>
              ))}
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border">
              {unitsLoading && <p className="p-3 text-xs text-muted-foreground">Loading…</p>}
              {!unitsLoading && units.length === 0 && <p className="p-3 text-xs text-muted-foreground">No locations found.</p>}
              {!unitsLoading && units.map((u) => {
                const chosen = u.id === connection.org_unit_id;
                return (
                  <div key={u.id} className={`flex items-center gap-2 border-b px-3 py-2 last:border-b-0 ${chosen ? "bg-primary/10" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{u.name}</p>
                      <p className="text-[11px] text-muted-foreground">{u.id}{u.level ? ` · level ${u.level}` : ""}</p>
                    </div>
                    {canManage && (
                      <Button size="sm" variant={chosen ? "default" : "outline"} className="h-7"
                        onClick={() => void pick({ org_unit_id: u.id }, `Reporting location set to ${u.name}`)}>
                        {chosen ? "Selected" : "Use"}
                      </Button>
                    )}
                    {(u.childCount ?? 0) > 0 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Open ${u.name}`}
                        onClick={() => void openUnit(u, [...trail, u])}><ChevronRight className="h-4 w-4" /></Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Data sets & elements */}
          <div className="space-y-3 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4 text-primary" /> Report (data set) & data elements</p>
            <div className="space-y-1">
              <Label className="text-xs">Data set</Label>
              <Select value={connection.dataset_id ?? ""} disabled={!canManage}
                onValueChange={(v) => void pick({ dataset_id: v }, "Report selected")}>
                <SelectTrigger><SelectValue placeholder={`Choose from ${catalog.dataSets.length} reports`} /></SelectTrigger>
                <SelectContent className="max-h-80">
                  {catalog.dataSets.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} · {d.periodType}{d.canWrite ? "" : " (read only)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedSet ? (
              <>
                <Input className="h-9" placeholder={`Filter ${selectedSet.dataElements.length} data elements`}
                  value={deFilter} onChange={(e) => setDeFilter(e.target.value)} />
                <div className="max-h-60 overflow-y-auto rounded-md border">
                  {elements.map((e) => (
                    <div key={e.id} className="border-b px-3 py-2 last:border-b-0">
                      <p className="text-sm">{e.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {e.id} · {e.valueType ?? "—"} · {e.categoryOptionCombos.length} breakdown{e.categoryOptionCombos.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  ))}
                  {elements.length === 0 && <p className="p-3 text-xs text-muted-foreground">No matching data elements.</p>}
                </div>
                <p className="text-xs text-muted-foreground">Link each app indicator to one of these below.</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Choose a report to see the data elements you can send to.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
