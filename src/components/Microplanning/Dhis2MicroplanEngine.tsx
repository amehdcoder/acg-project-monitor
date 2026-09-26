import { useCallback, useEffect, useMemo, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Database, Loader2, Lock, Network, RefreshCw, Sparkles, Wand2 } from "lucide-react";

type Conn = { id: string; name: string; base_url: string; project_id: string; last_sync_at: string | null; last_status: string | null };
type Coc = { id: string; name: string };
type El = { id: string; name: string; kind: "dataElement" | "indicator"; dataSet?: string | null; categoryOptionCombos?: Coc[] };
type Sug = { remote_id: string; remote_name: string; kind: El["kind"]; coc_id: string | null; coc_name: string | null; score: number };
type Schema = {
  system: { name: string | null; version: string | null };
  kpis: { key: string; label: string }[];
  dataSets: { id: string; name: string; periodType: string; elementCount: number }[];
  elements: El[];
  levels: { level: number; name: string }[];
  counts: { dataSets: number; dataElements: number; indicators: number; programs: number };
  suggestions: Record<string, Sug[]>;
  mappings: { indicator_key: string; remote_id: string; remote_name: string | null; category_option_combo: string | null; dimensions: { kind?: string } }[];
};
type Pick = { remote_id: string; coc_id: string | null };

async function call<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("health-exchange", { body });
  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try { const j = await error.context.json(); msg = typeof j.error === "string" ? j.error : j.message ?? msg; } catch { /* keep */ }
    }
    throw new Error(msg);
  }
  return data as T;
}

const NONE = "__none";
const defaultPeriod = () => String(new Date().getFullYear());

export default function Dhis2MicroplanEngine({ projectId, projectName, canUse, onPulled }: {
  projectId: string; projectName?: string | null; canUse: boolean; onPulled?: () => void;
}) {
  const [conns, setConns] = useState<Conn[]>([]);
  const [connId, setConnId] = useState("");
  const [open, setOpen] = useState(false);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [period, setPeriod] = useState(defaultPeriod());
  const [level, setLevel] = useState("3");
  const [pushLevel, setPushLevel] = useState<"lga" | "state">("lga");
  const [result, setResult] = useState<any>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    supabase.from("health_exchange_connections").select("id,name,base_url,project_id,last_sync_at,last_status")
      .eq("kind", "dhis2").eq("is_active", true).order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as Conn[];
        setConns(list);
        setConnId((cur) => cur || list.find((c) => c.project_id === projectId)?.id || list[0]?.id || "");
      });
  }, [projectId]);

  const conn = conns.find((c) => c.id === connId);
  const elById = useMemo(() => new Map((schema?.elements ?? []).map((e) => [e.id, e])), [schema]);

  const detect = useCallback(async () => {
    if (!connId) return;
    setBusy("schema");
    try {
      const s = await call<Schema>({ action: "mp_schema", connection_id: connId });
      setSchema(s);
      const next: Record<string, Pick> = {};
      for (const k of s.kpis) {
        const saved = s.mappings.find((m) => m.indicator_key === `mp:${k.key}`);
        if (saved) next[k.key] = { remote_id: saved.remote_id, coc_id: saved.category_option_combo };
      }
      setPicks(next);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }, [connId]);

  useEffect(() => { if (open && canUse && connId && !schema) detect(); }, [open, canUse, connId, schema, detect]);
  useEffect(() => { setSchema(null); setResult(null); }, [connId]);

  const applySuggestions = () => {
    if (!schema) return;
    const next = { ...picks };
    let n = 0;
    for (const k of schema.kpis) {
      const s = schema.suggestions[k.key]?.[0];
      if (!next[k.key] && s && s.score >= 0.45) { next[k.key] = { remote_id: s.remote_id, coc_id: s.coc_id }; n++; }
    }
    setPicks(next);
    toast.success(n ? `Applied ${n} suggested matches` : "No new confident matches");
  };

  const save = async () => {
    if (!schema) return;
    setBusy("save");
    try {
      const mappings = Object.entries(picks).map(([kpi, p]) => {
        const el = elById.get(p.remote_id);
        return { kpi, label: schema.kpis.find((k) => k.key === kpi)?.label, remote_id: p.remote_id, remote_name: el?.name, coc_id: p.coc_id, kind: el?.kind ?? "dataElement" };
      });
      const clear = schema.kpis.map((k) => k.key).filter((k) => !picks[k]);
      await call({ action: "mp_save_mappings", connection_id: connId, mappings, clear });
      toast.success(`Saved ${mappings.length} mappings`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  const push = async (dry: boolean) => {
    setBusy(dry ? "check" : "push"); setResult(null);
    try {
      if (schema) await save();
      const r = await call({ action: "mp_push", connection_id: connId, project_id: projectId, period, level: pushLevel, dry_run: dry });
      setResult({ type: "push", ...r });
      toast.success(dry ? `Check passed: ${r.sent} values for ${r.matched} areas` : `Sent ${r.sent} values to DHIS2`);
    } catch (e) { toast.error((e as Error).message); setResult({ type: "error", message: (e as Error).message }); }
    finally { setBusy(null); }
  };

  const pull = async () => {
    if (!connId || !projectId) return;
    setBusy("pull"); setResult(null);
    try {
      const r = await call({ action: "mp_pull", connection_id: connId, project_id: projectId, period, level: Number(level) });
      setResult({ type: "pull", ...r });
      toast.success(`Dashboard updated with ${r.areas} DHIS2 areas`);
      onPulled?.();
    } catch (e) { toast.error((e as Error).message); setResult({ type: "error", message: (e as Error).message }); }
    finally { setBusy(null); }
  };

  const mappedCount = Object.keys(picks).length;
  const disabledReason = !canUse ? "Only Owners, Super Admins and Systems Admins can use the exchange" : !conns.length ? "No DHIS2 connection yet — add one in Data Exchange" : !projectId ? "Select a project first" : null;

  return (
    <>
      <Card className="p-4 flex flex-col gap-3 border-primary/20">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Network className="h-5 w-5 text-primary mt-0.5" strokeWidth={1.5} />
            <div>
              <h3 className="text-sm font-semibold text-foreground">DHIS2 Data Exchange Engine</h3>
              <p className="text-xs text-muted-foreground">Auto-detects the DHIS2 schema, suggests matches and syncs microplanning both ways.</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
            <span className={`h-2 w-2 rounded-full ${conn ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`} />
            {conn ? conn.name : "Not connected"}
          </span>
        </div>
        {conn && <p className="text-[11px] text-muted-foreground font-mono truncate">{conn.base_url}{conn.last_sync_at ? ` · last sync ${new Date(conn.last_sync_at).toLocaleString()}` : ""}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!!disabledReason || busy === "pull"} onClick={pull}>
            {busy === "pull" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5 mr-1" />}
            Pull {period} from DHIS2
          </Button>
          <Button size="sm" variant="outline" disabled={!!disabledReason} onClick={() => setOpen(true)}>
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Open engine
          </Button>
        </div>
        {disabledReason && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> {disabledReason}</p>}
        {result?.type === "pull" && !open && <p className="text-[11px] text-foreground">Pulled {result.areas} areas · {result.kpis} KPIs matched{result.autoMapped ? ` (${result.autoMapped} automatically)` : ""}.</p>}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Network className="h-5 w-5 text-primary" strokeWidth={1.5} /> DHIS2 Data Exchange Engine</DialogTitle>
            <DialogDescription>Microplanning for {projectName ?? "this project"} ↔ {conn?.name ?? "DHIS2"}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
            <div className="space-y-1">
              <Label className="text-xs">DHIS2 connection</Label>
              <Select value={connId} onValueChange={setConnId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choose connection" /></SelectTrigger>
                <SelectContent>{conns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.base_url}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={detect} disabled={busy === "schema"}>
              {busy === "schema" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />} Re-detect schema
            </Button>
          </div>

          {busy === "schema" && !schema && <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Reading data sets, data elements, indicators and disaggregations…</div>}

          {schema && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  ["Instance", `${schema.system.name ?? "DHIS2"} ${schema.system.version ?? ""}`],
                  ["Data sets", schema.counts.dataSets],
                  ["Data elements", schema.counts.dataElements],
                  ["Indicators", schema.counts.indicators],
                  ["Mapped KPIs", `${mappedCount}/${schema.kpis.length}`],
                ].map(([l, v]) => (
                  <div key={String(l)} className="rounded-lg border border-border/60 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{l}</p>
                    <p className="text-sm font-semibold truncate">{v}</p>
                  </div>
                ))}
              </div>

              <Tabs defaultValue="map">
                <TabsList>
                  <TabsTrigger value="map"><Wand2 className="h-3.5 w-3.5 mr-1" />Mapping</TabsTrigger>
                  <TabsTrigger value="sync"><Database className="h-3.5 w-3.5 mr-1" />Push & pull</TabsTrigger>
                </TabsList>

                <TabsContent value="map" className="space-y-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter DHIS2 items…" className="h-8 max-w-xs text-xs" />
                    <Button size="sm" variant="outline" onClick={applySuggestions}><Sparkles className="h-3.5 w-3.5 mr-1" />Apply suggestions</Button>
                    <Button size="sm" onClick={save} disabled={busy === "save"}>{busy === "save" && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save mappings</Button>
                  </div>
                  <div className="rounded-lg border border-border/60 divide-y divide-border/60">
                    {schema.kpis.map((k) => {
                      const pick = picks[k.key];
                      const el = pick ? elById.get(pick.remote_id) : undefined;
                      const sugs = schema.suggestions[k.key] ?? [];
                      const f = filter.trim().toLowerCase();
                      const options = [...new Map([...sugs.map((s) => elById.get(s.remote_id)).filter(Boolean) as El[], ...(el ? [el] : []),
                        ...(f ? schema.elements.filter((e) => e.name.toLowerCase().includes(f)).slice(0, 60) : [])].map((e) => [e.id, e])).values()];
                      const top = sugs[0];
                      return (
                        <div key={k.key} className="grid gap-2 p-3 md:grid-cols-[180px_1fr_200px] items-center hover:bg-muted/40">
                          <div>
                            <p className="text-sm font-medium">{k.label}</p>
                            {top && <p className="text-[11px] text-muted-foreground">Best match {Math.round(top.score * 100)}%</p>}
                          </div>
                          <Select value={pick?.remote_id ?? NONE} onValueChange={(v) => setPicks((p) => {
                            const n = { ...p };
                            if (v === NONE) delete n[k.key];
                            else n[k.key] = { remote_id: v, coc_id: sugs.find((s) => s.remote_id === v)?.coc_id ?? null };
                            return n;
                          })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not mapped" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Not mapped</SelectItem>
                              {options.map((e) => {
                                const s = sugs.find((x) => x.remote_id === e.id);
                                return <SelectItem key={e.id} value={e.id}>{e.kind === "indicator" ? "◆ " : ""}{e.name}{s ? ` · ${Math.round(s.score * 100)}%` : ""}</SelectItem>;
                              })}
                            </SelectContent>
                          </Select>
                          <Select disabled={!el || el.kind === "indicator" || !el.categoryOptionCombos?.length} value={pick?.coc_id ?? NONE}
                            onValueChange={(v) => setPicks((p) => ({ ...p, [k.key]: { ...p[k.key], coc_id: v === NONE ? null : v } }))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Disaggregation" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Total (no disaggregation)</SelectItem>
                              {(el?.categoryOptionCombos ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">◆ = DHIS2 indicator (pull only). Type in the filter to search every data element and indicator on the instance.</p>
                </TabsContent>

                <TabsContent value="sync" className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1"><Label className="text-xs">DHIS2 period</Label>
                      <Input value={period} onChange={(e) => setPeriod(e.target.value.trim())} placeholder="2026, 202609 or 2026Q3" className="h-9 font-mono" /></div>
                    <div className="space-y-1"><Label className="text-xs">Pull at level</Label>
                      <Select value={level} onValueChange={setLevel}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{(schema.levels.length ? schema.levels.filter((l) => l.level >= 2) : [{ level: 2, name: "State" }, { level: 3, name: "LGA" }, { level: 4, name: "Ward" }]).map((l) => <SelectItem key={l.level} value={String(l.level)}>{l.name} (level {l.level})</SelectItem>)}</SelectContent>
                      </Select></div>
                    <div className="space-y-1"><Label className="text-xs">Push totals by</Label>
                      <Select value={pushLevel} onValueChange={(v) => setPushLevel(v as "lga" | "state")}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="lga">LGA</SelectItem><SelectItem value="state">State</SelectItem></SelectContent>
                      </Select></div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/60 p-3 space-y-2">
                      <p className="text-sm font-semibold flex items-center gap-1.5"><ArrowDownToLine className="h-4 w-4 text-primary" strokeWidth={1.5} />Pull into dashboard</p>
                      <p className="text-xs text-muted-foreground">Fills this project's microplanning dashboard with DHIS2 values. Unmapped KPIs are matched automatically; re-pulling updates rather than duplicates.</p>
                      <Button size="sm" onClick={pull} disabled={!!busy}>{busy === "pull" && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Pull now</Button>
                    </div>
                    <div className="rounded-lg border border-border/60 p-3 space-y-2">
                      <p className="text-sm font-semibold flex items-center gap-1.5"><ArrowUpFromLine className="h-4 w-4 text-primary" strokeWidth={1.5} />Push to DHIS2</p>
                      <p className="text-xs text-muted-foreground">Sums microplanning entries per area, matches them to your DHIS2 locations and sends mapped data elements.</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => push(true)} disabled={!!busy}>{busy === "check" && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Check first</Button>
                        <Button size="sm" onClick={() => push(false)} disabled={!!busy || result?.type !== "push" || !result?.dry_run}>{busy === "push" && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Send to DHIS2</Button>
                      </div>
                    </div>
                  </div>
                  {result && (
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
                      {result.type === "error" && <p className="text-destructive">{result.message}</p>}
                      {result.type === "pull" && <>
                        <p className="font-semibold">Pulled {result.areas} areas for {result.period}</p>
                        {Object.entries(result.mapped ?? {}).map(([k, v]) => <p key={k} className="text-muted-foreground">{schema.kpis.find((x) => x.key === k)?.label ?? k} ← {String(v)}</p>)}
                      </>}
                      {result.type === "push" && <>
                        <p className="font-semibold">{result.dry_run ? "Check" : "Send"}: {result.sent} values · {result.matched} areas matched</p>
                        {result.counts && <p className="text-muted-foreground">Imported {result.counts.imported ?? 0} · updated {result.counts.updated ?? 0} · ignored {result.counts.ignored ?? 0}</p>}
                        {result.unmatched?.length > 0 && <p className="text-muted-foreground">Not found in DHIS2: {result.unmatched.slice(0, 12).join("; ")}{result.unmatched.length > 12 ? "…" : ""}</p>}
                        {result.conflicts?.map((c: string, i: number) => <p key={i} className="text-destructive">{c}</p>)}
                      </>}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
