import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Loader2, LogIn, Network, Search, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { EYE_INDICATORS, computeEyeIndicators } from "@/lib/eyeReport/eyeIndicators";
import {
  browseDhis2, dhis2Login, dhis2SearchUnits, eyeExchangePull, eyeExchangePush, listEyeConnections, listMappings, saveConnection, saveMapping,
  type Dhis2Catalog, type Dhis2OrgUnit, type ExchangeConnection, type ExchangeMapping,
} from "@/lib/programmeModule/healthExchange";
import { supabase } from "@/integrations/supabase/client";
import type { EyeReportRow } from "@/lib/eyeReport/definition";

interface PullRow { indicator_key: string; label: string; amehnities: number; dhis2: number | null; match: boolean }
const Sel = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`h-9 w-full rounded-md border bg-background px-2 text-sm ${p.className ?? ""}`} />;

/** Standalone DHIS2 Data Exchange for the Eye Health Daily Facility Report (own servers, own mappings). */
export default function EyeDhis2Exchange({ projectId, rows }: { projectId: string; rows: EyeReportRow[] }) {
  const [conns, setConns] = useState<ExchangeConnection[]>([]);
  const [connId, setConnId] = useState("");
  const [maps, setMaps] = useState<ExchangeMapping[]>([]);
  const [catalog, setCatalog] = useState<Dhis2Catalog | null>(null);
  const prev = new Date(); prev.setUTCDate(1); prev.setUTCMonth(prev.getUTCMonth() - 1);
  const [month, setMonth] = useState(prev.toISOString().slice(0, 7));
  const [busy, setBusy] = useState("");
  const [pull, setPull] = useState<PullRow[] | null>(null);
  const [login, setLogin] = useState({ url: "", user: "", pass: "", token: "", open: false });
  const [ouQ, setOuQ] = useState("");
  const [ous, setOus] = useState<Dhis2OrgUnit[]>([]);

  const loadConns = useCallback(async (select?: string) => {
    const c = await listEyeConnections(projectId).catch(() => []);
    setConns(c); setConnId((id) => select || (c.some((x) => x.id === id) ? id : c[0]?.id || ""));
    if (!c.length) setLogin((l) => ({ ...l, open: true }));
  }, [projectId]);
  useEffect(() => { void loadConns(); }, [loadConns]);
  const conn = conns.find((c) => c.id === connId);
  useEffect(() => {
    setPull(null); setCatalog(null); setMaps([]);
    if (!connId) return;
    listMappings(connId).then(setMaps).catch(() => undefined);
    browseDhis2(connId).then(setCatalog).catch((e) => toast.error(`DHIS2: ${e instanceof Error ? e.message : "could not load reports"}`));
  }, [connId]);

  const period = month.replace("-", "");
  const values = useMemo(() => {
    const v = computeEyeIndicators(rows.filter((r) => r.report_date.startsWith(month)));
    return EYE_INDICATORS.map((d, i) => ({ ...d, value: v[i].value }));
  }, [rows, month]);
  const dataSet = catalog?.dataSets.find((d) => d.id === conn?.dataset_id);
  const elements = dataSet?.dataElements ?? catalog?.dataSets.flatMap((d) => d.dataElements) ?? [];
  const mapBy = new Map(maps.map((m) => [m.indicator_key, m]));
  const linked = maps.filter((m) => m.remote_id && m.remote_id !== "UNMAPPED").length;

  const doLogin = async () => {
    setBusy("login");
    try {
      const r = await dhis2Login({ project_id: projectId, base_url: login.url.trim(), username: login.user || undefined, password: login.pass || undefined, token: login.token || undefined, scope: "eye_report", label: "Eye Health" });
      toast.success(`Signed in to ${r.system.name ?? "DHIS2"} as ${r.user.displayName ?? r.user.username}`);
      setLogin({ url: "", user: "", pass: "", token: "", open: false });
      await loadConns(r.connection_id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Sign-in failed"); } finally { setBusy(""); }
  };
  const patchConn = async (patch: Partial<ExchangeConnection>) => {
    if (!conn) return;
    const saved = await saveConnection({ ...conn, ...patch });
    setConns((cs) => cs.map((c) => (c.id === saved.id ? saved : c)));
  };
  const disconnect = async () => {
    if (!conn || !confirm(`Disconnect ${conn.name} from the Daily Facility Report?`)) return;
    const { error } = await supabase.functions.invoke("health-exchange", { body: { action: "dhis2_disconnect", connection_id: conn.id } });
    if (error) { toast.error(error.message); return; }
    toast.success("Disconnected"); await loadConns();
  };
  const searchOus = async () => {
    if (!connId || ouQ.trim().length < 2) return;
    setBusy("ou");
    try { setOus((await dhis2SearchUnits(connId, ouQ.trim())).orgUnits); } catch (e) { toast.error(e instanceof Error ? e.message : "Search failed"); } finally { setBusy(""); }
  };
  const link = async (key: string, label: string, remote_id: string, coc?: string | null) => {
    const el = elements.find((e) => e.id === remote_id);
    const c = coc !== undefined ? coc : el?.categoryOptionCombos.length === 1 ? el.categoryOptionCombos[0].id : null;
    try { await saveMapping({ connection_id: connId, indicator_key: key, indicator_label: label, remote_id, remote_name: el?.name ?? null, category_option_combo: c }); setMaps(await listMappings(connId)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save link"); }
  };
  const run = async (kind: "dry" | "push" | "pull") => {
    if (!connId) return;
    setBusy(kind);
    try {
      if (kind === "pull") { const r = await eyeExchangePull(connId, period); setPull(r.rows); toast.success(`Pulled from DHIS2 — ${r.rows.filter((x: PullRow) => x.match).length}/${r.rows.length} match`); }
      else { const r = await eyeExchangePush(connId, period, {}, kind === "dry"); toast.success(r.message || (kind === "dry" ? "Dry run passed" : "Sent to DHIS2")); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "DHIS2 exchange failed"); } finally { setBusy(""); }
  };

  const groups = [...new Set(values.map((v) => v.group))];
  const pullBy = new Map((pull ?? []).map((p) => [p.indicator_key, p]));

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-r from-eye-deep via-eye-blue to-eye-teal p-4 text-primary-foreground">
        <div>
          <h3 className="flex items-center gap-2 text-base font-extrabold"><Network className="h-5 w-5" /> DHIS2 Data Exchange · Daily Facility Report</h3>
          <p className="max-w-3xl text-xs opacity-85">Its own DHIS2 servers and indicator links, separate from Beneficiary Records. Monthly totals of the standard Eye Health indicators are pushed to and pulled from DHIS2. Pinhole/BCVA zeros mean it was not used and are never treated as poor results.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setLogin((l) => ({ ...l, open: !l.open }))}><LogIn className="mr-1 h-4 w-4" /> Connect DHIS2 server</Button>
      </div>

      {login.open && (
        <div className="grid gap-2 border-b bg-eye-sky p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input placeholder="https://dhis2.example.org" value={login.url} onChange={(e) => setLogin({ ...login, url: e.target.value })} className="lg:col-span-2" />
          <Input placeholder="Username" autoComplete="off" value={login.user} onChange={(e) => setLogin({ ...login, user: e.target.value })} />
          <Input placeholder="Password" type="password" autoComplete="new-password" value={login.pass} onChange={(e) => setLogin({ ...login, pass: e.target.value })} />
          <Input placeholder="…or personal access token" type="password" value={login.token} onChange={(e) => setLogin({ ...login, token: e.target.value })} />
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-5">
            <Button disabled={busy === "login" || !login.url} onClick={() => void doLogin()} className="bg-eye-blue text-primary-foreground hover:bg-eye-blue/90">{busy === "login" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <LogIn className="mr-1 h-4 w-4" />} Sign in & save</Button>
            <span className="text-[11px] text-muted-foreground">Credentials are stored on the server only and never shown again.</span>
          </div>
        </div>
      )}

      <div className="grid gap-3 border-b p-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold">DHIS2 server
          <div className="mt-1 flex gap-1">
            <Sel value={connId} onChange={(e) => setConnId(e.target.value)}>{conns.length ? conns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>) : <option value="">None connected</option>}</Sel>
            {conn && <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" title="Disconnect" onClick={() => void disconnect()}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        </label>
        <label className="text-xs font-semibold">DHIS2 data set (report)
          <Sel className="mt-1" disabled={!catalog} value={conn?.dataset_id ?? ""} onChange={(e) => void patchConn({ dataset_id: e.target.value || null })}>
            <option value="">{catalog ? "Any data set" : conn ? "Loading…" : "—"}</option>
            {catalog?.dataSets.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.periodType})</option>)}
          </Sel>
        </label>
        <div className="text-xs font-semibold">Organisation unit <span className="font-mono font-normal text-muted-foreground">{conn?.org_unit_id || "not set"}</span>
          <div className="mt-1 flex gap-1">
            <Input className="h-9" placeholder="Search facility / LGA / State" value={ouQ} disabled={!conn} onChange={(e) => setOuQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void searchOus()} />
            <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" disabled={!conn || busy === "ou"} onClick={() => void searchOus()}>{busy === "ou" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
          </div>
          {ous.length > 0 && (
            <Sel className="mt-1" value="" onChange={(e) => { void patchConn({ org_unit_id: e.target.value }); setOus([]); toast.success("Organisation unit saved"); }}>
              <option value="">Choose from {ous.length} matches…</option>
              {ous.map((o) => <option key={o.id} value={o.id}>{o.name}{o.level ? ` · level ${o.level}` : ""}</option>)}
            </Sel>
          )}
        </div>
        <label className="text-xs font-semibold">Reporting month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 block h-9 w-full rounded-md border bg-background px-2 text-sm" />
        </label>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2 lg:col-span-4">
          <Button variant="outline" disabled={!connId || !!busy} onClick={() => void run("dry")}>{busy === "dry" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />} Dry run</Button>
          <Button disabled={!connId || !!busy} onClick={() => void run("push")} className="bg-eye-blue text-primary-foreground hover:bg-eye-blue/90">{busy === "push" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="mr-1 h-4 w-4" />} Push to DHIS2</Button>
          <Button variant="secondary" disabled={!connId || !!busy} onClick={() => void run("pull")}>{busy === "pull" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ArrowDownToLine className="mr-1 h-4 w-4" />} Pull & compare</Button>
          {conn && <span className="text-xs text-muted-foreground">{linked}/{EYE_INDICATORS.length} indicators linked</span>}
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-muted text-left text-xs text-muted-foreground"><tr><th className="p-2">Indicator</th><th className="p-2 text-right">Amehnities</th><th className="p-2 text-right">DHIS2</th><th className="p-2">Linked DHIS2 data element</th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="bg-eye-sky"><td colSpan={4} className="p-2 text-xs font-bold uppercase tracking-wide text-eye-blue">{g}</td></tr>
                {values.filter((v) => v.group === g).map((v, i) => {
                  const p = pullBy.get(v.key); const m = mapBy.get(v.key);
                  const el = elements.find((e) => e.id === m?.remote_id);
                  return (
                    <motion.tr key={v.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.01, 0.3) }} className="border-t">
                      <td className="p-2">{v.label}</td>
                      <td className="p-2 text-right font-bold tabular-nums">{v.value}</td>
                      <td className="whitespace-nowrap p-2 text-right tabular-nums">{p ? (p.dhis2 ?? "—") : ""}{p && (p.match ? <CheckCircle2 className="ml-1 inline h-4 w-4 text-status-success" /> : <XCircle className="ml-1 inline h-4 w-4 text-destructive" />)}</td>
                      <td className="min-w-[240px] p-2">
                        {elements.length ? (
                          <div className="space-y-1">
                            <Sel value={el ? el.id : ""} onChange={(e) => e.target.value && void link(v.key, v.label, e.target.value)}>
                              <option value="">{m?.remote_id ? `Linked: ${m.remote_name ?? m.remote_id}` : "Choose data element"}</option>
                              {elements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </Sel>
                            {el && el.categoryOptionCombos.length > 1 && (
                              <Sel value={m?.category_option_combo ?? ""} onChange={(e) => void link(v.key, v.label, el.id, e.target.value || null)}>
                                <option value="">Choose breakdown</option>
                                {el.categoryOptionCombos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </Sel>
                            )}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">{m?.remote_id ? `Linked: ${m.remote_name ?? m.remote_id}` : conn ? "Loading DHIS2 elements…" : "Connect a server"}</span>}
                      </td>
                    </motion.tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
