/**
 * Universal Kobo Dashboard Hub (/kobo-hub)
 *
 * Connect ANY KoboToolbox form and get a full real-time analytics dashboard
 * generated automatically — schema inference, choice labels, geography,
 * repeat-group flattening, dynamic widgets, maps, reconciliation and exports.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Activity, ArrowLeft, Database, Download, FileImage, FileText, GitCompareArrows,
  Globe2, Layers, Loader2, Lock, MapPin, Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useChecklistPermissions } from "@/hooks/useChecklistPermissions";
import { exportSnapshotPNG, exportSnapshotPDF } from "@/lib/isc/snapshotExport";
import {
  deleteConnection, deletePreset, getActiveId, listConnections, listPresets,
  loadCache, savePreset, setActiveId, syncConnection,
  type HubCache, type HubConnection, type HubPreset,
} from "@/lib/koboHub/client";
import {
  applyFilters, downloadCsv, emptyFilters, integrityScan,
  type HubFilters as Filters, type Row,
} from "@/lib/koboHub/analytics";
import HubFilters from "./HubFilters";
import FieldWidgets from "./FieldWidgets";
import HubMap from "./HubMap";
import HubRepeats from "./HubRepeats";
import HubReconciliation from "./HubReconciliation";
import HubRawData from "./HubRawData";
import WhoDashboard from "./WhoDashboard";
import IntegrationManagerDialog from "./IntegrationManagerDialog";


const fmt = (n: number) => n.toLocaleString();

export default function KoboHubPage({ manage = false }: { manage?: boolean }) {
  const navigate = useNavigate();
  const perms = useChecklistPermissions();
  const boardRef = useRef<HTMLDivElement>(null);

  const [connections, setConnections] = useState<HubConnection[]>(() => listConnections());
  const [activeId, setActive] = useState<string | null>(() => getActiveId());
  const [cache, setCache] = useState<HubCache | null>(() => {
    const id = getActiveId();
    return id ? loadCache(id) : null;
  });
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [syncing, setSyncing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(manage);
  const [editing, setEditing] = useState<HubConnection | null>(null);
  const [presets, setPresets] = useState<HubPreset[]>([]);
  const [lastSyncLabel, setLastSyncLabel] = useState("");

  const connection = useMemo(() => connections.find((c) => c.id === activeId) ?? null, [connections, activeId]);

  useEffect(() => { if (manage) setDialogOpen(true); }, [manage]);
  useEffect(() => { setPresets(activeId ? listPresets(activeId) : []); }, [activeId, dialogOpen]);

  const reload = useCallback((id?: string) => {
    const all = listConnections();
    setConnections(all);
    const next = id ?? getActiveId();
    setActive(next);
    setCache(next ? loadCache(next) : null);
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (!connection) return;
    setSyncing(true);
    try {
      const c = await syncConnection(connection);
      setCache(c);
      setLastSyncLabel(new Date().toLocaleTimeString());
      if (!silent) toast({ title: "Live KoboSync", description: `${c.count} records synced.` });
    } catch (e: any) {
      if (!silent) toast({ title: "Sync failed", description: e?.message ?? "Unable to reach KoboToolbox.", variant: "destructive" });
    } finally { setSyncing(false); }
  }, [connection]);

  // Configurable auto-refresh cadence
  useEffect(() => {
    if (!connection?.autoRefreshSeconds) return;
    const t = setInterval(() => { refresh(true); }, Math.max(30, connection.autoRefreshSeconds) * 1000);
    return () => clearInterval(t);
  }, [connection, refresh]);

  /* ------------------------------------------------------------- derived */

  const schema = cache?.schema ?? null;
  const allRows = (cache?.results ?? []) as Row[];
  const rows = useMemo(
    () => (schema ? applyFilters(allRows, schema, filters) : []),
    [allRows, schema, filters],
  );

  const integrity = useMemo(() => (schema ? integrityScan(rows, schema) : null), [rows, schema]);

  const repeatTotal = useMemo(() => {
    if (!schema) return 0;
    let n = 0;
    for (const r of rows) {
      for (const rep of schema.repeats) {
        const leaf = rep.name.split("/").pop() as string;
        const arr = (r as any)[rep.name] ?? (r as any)[leaf];
        if (Array.isArray(arr)) n += arr.length;
      }
    }
    return n;
  }, [rows, schema]);

  const coverage = useMemo(() => {
    if (!schema) return { wards: 0, lgas: 0 };
    const wards = new Set<string>(); const lgas = new Set<string>();
    for (const r of rows) {
      const w = schema.geo.ward ? String((r as any)[schema.geo.ward] ?? "") : "";
      const l = schema.geo.lga ? String((r as any)[schema.geo.lga] ?? "") : "";
      if (w) wards.add(w);
      if (l) lgas.add(l);
    }
    return { wards: wards.size, lgas: lgas.size };
  }, [rows, schema]);

  const geoFields = useMemo(() => (schema?.fields ?? []).filter((f) => f.type === "geopoint"), [schema]);
  const colourField = useMemo(
    () => (schema?.fields ?? []).find((f) => f.type === "select_one" && /status|outcome|result|offered/i.test(f.label)),
    [schema],
  );
  const widgetFields = useMemo(
    () => (schema?.fields ?? []).filter((f) =>
      ["select_one", "select_multiple", "integer", "decimal", "text", "boolean"].includes(f.type)),
    [schema],
  );

  const onSlice = (name: string, value: string) => {
    if (!value) return;
    setFilters((f) => {
      const slices = { ...f.slices };
      if (slices[name] === value) delete slices[name]; else slices[name] = value;
      return { ...f, slices };
    });
  };

  /* -------------------------------------------------------------- guards */

  if (perms.loading) {
    return <div className="min-h-[60vh] grid place-items-center bg-slate-950"><Loader2 className="h-6 w-6 animate-spin text-cyan-400" /></div>;
  }
  if (!perms.canView) {
    return (
      <div className="min-h-screen bg-slate-950 grid place-items-center p-6">
        <Card className="max-w-md bg-slate-900 border-slate-800">
          <CardContent className="p-8 text-center space-y-2">
            <Lock className="h-8 w-8 mx-auto text-amber-400" />
            <h2 className="text-lg font-semibold text-slate-100">Access restricted</h2>
            <p className="text-sm text-slate-400">
              The Universal Kobo Dashboard Hub is limited to administrators, granted analysts
              and supervisory roles. Ask an administrator for access.
            </p>
            <Button variant="outline" className="border-slate-700 text-slate-200" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to app
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ------------------------------------------------------------------ UI */

  const kpi = (icon: React.ReactNode, label: string, value: string, sub: string, tone: string) => (
    <Card className="bg-slate-900/70 border-slate-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
          <span className={tone}>{icon}</span>
        </div>
        <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
        <div className="text-[11px] text-slate-500">{sub}</div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-4 py-3 flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight flex items-center gap-2">
              <Database className="h-4 w-4 text-cyan-400" /> Universal Kobo Dashboard Hub
            </h1>
            <p className="text-[11px] text-slate-500 truncate">
              {cache?.formTitle ?? "No form connected"} · {perms.roleLabel}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {connections.length > 0 && (
              <Select value={activeId ?? ""} onValueChange={(v) => { setActiveId(v); reload(v); setFilters(emptyFilters()); }}>
                <SelectTrigger className="h-9 w-[220px] bg-slate-900 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Select dashboard" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Badge className={`gap-1 border ${syncing ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"}`}>
              <Activity className="h-3 w-3" />
              {syncing ? "Syncing…" : `Live KoboSync: ${fmt(cache?.count ?? 0)} records${lastSyncLabel ? ` · ${lastSyncLabel}` : ""}`}
            </Badge>
            <Button size="sm" variant="outline" className="border-slate-700 text-slate-200" disabled={!connection || syncing}
              onClick={() => refresh(false)}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> Refresh
            </Button>
            {perms.canManageIntegrations && (
              <>
                {connection && (
                  <Button size="sm" variant="outline" className="border-slate-700 text-slate-200"
                    onClick={() => { setEditing(connection); setDialogOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500"
                  onClick={() => { setEditing(null); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add integration
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5 space-y-5">
        {!connection || !schema ? (
          <Card className="bg-slate-900/70 border-slate-800">
            <CardContent className="p-12 text-center space-y-3">
              <Database className="h-10 w-10 mx-auto text-cyan-400" />
              <h2 className="text-lg font-semibold">Connect a KoboToolbox form to begin</h2>
              <p className="text-sm text-slate-400 max-w-lg mx-auto">
                Paste your Kobo server, API token and form asset UID. The hub reads the form
                definition straight from the v2 REST API, infers every field type, flattens repeat
                groups and generates the full dashboard — no XLSForm upload required.
              </p>
              {perms.canManageIntegrations ? (
                <Button className="bg-cyan-600 hover:bg-cyan-500" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add new Kobo integration
                </Button>
              ) : (
                <p className="text-xs text-amber-400">Ask an administrator to connect a form.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {kpi(<Database className="h-4 w-4" />, "Submissions", fmt(rows.length),
                `${fmt(repeatTotal)} flattened repeat rows`, "text-emerald-400")}
              {kpi(<Globe2 className="h-4 w-4" />, "Geographic coverage", `${fmt(coverage.wards)} wards`,
                `${fmt(coverage.lgas)} LGAs reached`, "text-cyan-400")}
              {kpi(<ShieldCheck className="h-4 w-4" />, "Data integrity score", `${integrity?.score ?? 100}/100`,
                `${integrity?.issues.length ?? 0} anomalies flagged`,
                (integrity?.score ?? 100) >= 85 ? "text-emerald-400" : (integrity?.score ?? 0) >= 60 ? "text-amber-400" : "text-red-400")}
              {kpi(<Layers className="h-4 w-4" />, "Detected schema", `${schema.fields.length} fields`,
                `${schema.repeats.length} repeat block(s) · refresh ${connection.autoRefreshSeconds}s`, "text-slate-100")}
            </div>

            <HubFilters rows={allRows} schema={schema} filters={filters} onChange={setFilters} />

            {/* Export & preset bar */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Snapshot &amp; presets</span>
              {presets.map((p) => (
                <Badge key={p.id} className="gap-1 bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer"
                  onClick={() => setFilters(p.filters as Filters)}>
                  {p.name}
                  <button onClick={(e) => { e.stopPropagation(); deletePreset(p.id); setPresets(listPresets(activeId!)); }} aria-label="Delete preset">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button size="sm" variant="ghost" className="text-slate-300 hover:text-cyan-300"
                onClick={() => {
                  const name = window.prompt("Preset name");
                  if (!name || !activeId) return;
                  savePreset({ id: `p_${Date.now().toString(36)}`, name, connectionId: activeId, filters });
                  setPresets(listPresets(activeId));
                }}>
                <Save className="h-4 w-4 mr-1" /> Save view
              </Button>
              <div className="ml-auto flex items-center gap-2">
                {perms.canExport ? (
                  <>
                    <Button size="sm" variant="outline" className="border-slate-700 text-slate-200"
                      onClick={() => downloadCsv(`kobo-hub-${connection.name}`, rows as any)}>
                      <Download className="h-4 w-4 mr-1" /> CSV
                    </Button>
                    <Button size="sm" variant="outline" className="border-slate-700 text-slate-200"
                      onClick={() => boardRef.current && exportSnapshotPNG(boardRef.current, connection.name)}>
                      <FileImage className="h-4 w-4 mr-1" /> PNG
                    </Button>
                    <Button size="sm" variant="outline" className="border-slate-700 text-slate-200"
                      onClick={() => boardRef.current && exportSnapshotPDF(boardRef.current, connection.name, cache?.formTitle ?? "")}>
                      <FileText className="h-4 w-4 mr-1" /> PDF
                    </Button>
                  </>
                ) : (
                  <span className="text-[11px] text-amber-400 flex items-center gap-1"><Lock className="h-3 w-3" /> Export restricted</span>
                )}
                {perms.canManageIntegrations && (
                  <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300"
                    onClick={() => {
                      if (!window.confirm(`Remove “${connection.name}” and its cached data?`)) return;
                      deleteConnection(connection.id);
                      reload();
                    }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div ref={boardRef} className="space-y-5">

              {cache?.drift?.changed && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <span className="font-semibold">Kobo schema updated — dashboard adapted automatically.</span>{" "}
                  {cache.drift.added.length > 0 && <>{cache.drift.added.length} new field(s){cache.drift.added.slice(0, 4).length ? `: ${cache.drift.added.slice(0, 4).map((f) => f.label).join(", ")}` : ""}. </>}
                  {cache.drift.removed.length > 0 && <>{cache.drift.removed.length} field(s) removed. </>}
                  {cache.drift.retyped.length > 0 && <>{cache.drift.retyped.length} field(s) changed type. </>}
                  {cache.drift.addedRepeats.length > 0 && <>{cache.drift.addedRepeats.length} new repeat group(s). </>}
                </div>
              )}
              <Tabs defaultValue="who" className="space-y-4">
                <TabsList className="bg-slate-900 border border-slate-800 flex-wrap h-auto">
                  <TabsTrigger value="who" className="text-slate-300 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-200">
                    <Activity className="h-4 w-4 mr-1" /> WHO dashboard
                  </TabsTrigger>
                  <TabsTrigger value="fields" className="text-slate-300 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-200">
                    <Layers className="h-4 w-4 mr-1" /> Field dashboards
                  </TabsTrigger>
                  <TabsTrigger value="maps" className="text-slate-300 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-200">
                    <MapPin className="h-4 w-4 mr-1" /> Spatial
                  </TabsTrigger>
                  <TabsTrigger value="repeats" className="text-slate-300 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-200">
                    <Database className="h-4 w-4 mr-1" /> Repeat groups
                  </TabsTrigger>
                  <TabsTrigger value="raw" className="text-slate-300 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-200">
                    <Database className="h-4 w-4 mr-1" /> Raw Kobo data
                  </TabsTrigger>
                  <TabsTrigger value="recon" className="text-slate-300 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-200">
                    <GitCompareArrows className="h-4 w-4 mr-1" /> Reconciliation
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="who">
                  <WhoDashboard connectionId={connection.id} schema={schema} rows={rows as any} formTitle={cache?.formTitle ?? connection.name} />
                </TabsContent>

                <TabsContent value="fields">
                  <FieldWidgets rows={rows} schema={schema} filters={filters} onSlice={onSlice} fields={widgetFields} />
                </TabsContent>

                <TabsContent value="raw">
                  <HubRawData rows={rows as any} schema={schema} />
                </TabsContent>

                <TabsContent value="maps" className="space-y-4">
                  {geoFields.length === 0 ? (

                    <Card className="bg-slate-900/70 border-slate-800">
                      <CardContent className="p-8 text-center text-sm text-slate-400">
                        This form has no geopoint question, so no spatial layer could be generated.
                      </CardContent>
                    </Card>
                  ) : geoFields.map((f) => (
                    <HubMap key={f.name} rows={rows} schema={schema} field={f} colourField={colourField} filters={filters} />
                  ))}
                </TabsContent>

                <TabsContent value="repeats">
                  <HubRepeats rows={rows} schema={schema} canExport={perms.canExport} />
                </TabsContent>

                <TabsContent value="recon">
                  <HubReconciliation rows={allRows} schema={schema} apiCount={cache?.count ?? 0} canExport={perms.canExport} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </main>

      <IntegrationManagerDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o && manage) navigate("/kobo-hub"); }}
        connection={editing}
        onSaved={(id) => { reload(id); setFilters(emptyFilters()); }}
      />
    </div>
  );
}
