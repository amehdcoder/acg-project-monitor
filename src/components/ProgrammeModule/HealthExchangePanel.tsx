import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, RefreshCw, Trash2, KeyRound, PlugZap, Download, Upload, Boxes, ScrollText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  KIND_LABEL, REPORTABLE_INDICATORS,
  listConnections, saveConnection, deleteConnection,
  listLogs, listStock, listMappings, saveMapping,
  saveCredential, testConnection, pullMetadata, pullStock, pushIndicators, pushFhirPatients,
  computeIndicatorValues,
  type ExchangeConnection, type ExchangeKind, type ExchangeLog,
  type CommodityStock, type ExchangeMapping,
} from "@/lib/programmeModule/healthExchange";

interface Props {
  projectId: string;
  /** Only administrators may configure servers and push data. */
  canManage?: boolean;
}

type Tab = "connections" | "indicators" | "commodities" | "logs";

const EMPTY = {
  name: "", kind: "dhis2" as ExchangeKind, base_url: "",
  auth_type: "bearer" as "bearer" | "basic" | "none",
  username: "", org_unit_id: "", dataset_id: "", default_period_type: "Monthly", is_active: true,
};

function currentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Two-way data exchange with national systems: DHIS2 (aggregate indicator
 * reporting), HL7 FHIR servers (person-level Patient/Condition records) and
 * logistics (LMIS) servers for morbidity kits and surgical consumables.
 *
 * Credentials never live in the browser: they are handed once to the backend
 * service, which stores them server-side and signs every outbound request.
 */
export default function HealthExchangePanel({ projectId, canManage }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("connections");
  const [rows, setRows] = useState<ExchangeConnection[]>([]);
  const [logs, setLogs] = useState<ExchangeLog[]>([]);
  const [stock, setStock] = useState<CommodityStock[]>([]);
  const [mappings, setMappings] = useState<ExchangeMapping[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const [secretFor, setSecretFor] = useState<ExchangeConnection | null>(null);
  const [secret, setSecret] = useState("");

  const [activeId, setActiveId] = useState<string>("");
  const [period, setPeriod] = useState(currentPeriod());
  const [values, setValues] = useState<{ key: string; label: string; value: number }[]>([]);

  const active = useMemo(() => rows.find((r) => r.id === activeId) ?? null, [rows, activeId]);

  const reload = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [c, l, s] = await Promise.all([
        listConnections(projectId), listLogs(projectId), listStock(projectId),
      ]);
      setRows(c); setLogs(l); setStock(s);
      setActiveId((prev) => prev || c[0]?.id || "");
    } catch (e: any) {
      toast({ title: "Could not load the exchange settings", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!activeId) { setMappings([]); return; }
    listMappings(activeId).then(setMappings).catch(() => setMappings([]));
  }, [activeId]);

  useEffect(() => {
    if (!projectId || tab !== "indicators") return;
    computeIndicatorValues(projectId, period).then(setValues).catch(() => setValues([]));
  }, [projectId, period, tab]);

  const run = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try {
      const res = await fn();
      toast({ title: ok, description: res?.message ?? undefined });
      await reload();
    } catch (e: any) {
      toast({ title: "That did not work", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.base_url.trim()) {
      toast({ title: "Give the server a name and a web address", variant: "destructive" });
      return;
    }
    await run("save", async () => {
      await saveConnection({ ...editing, project_id: projectId });
      setEditing(null);
    }, "Server saved");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: "connections", label: "Servers", icon: PlugZap },
          { key: "indicators", label: "National reporting", icon: Upload },
          { key: "commodities", label: "Kits & consumables", icon: Boxes },
          { key: "logs", label: "Exchange history", icon: ScrollText },
        ] as const).map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "default" : "outline"}
            className="gap-1" onClick={() => setTab(t.key)}>
            <t.icon className="h-4 w-4" /> {t.label}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => void reload()}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {canManage && tab === "connections" && (
            <Button size="sm" className="gap-1" onClick={() => setEditing({ ...EMPTY })}>
              <Plus className="h-4 w-4" /> Add server
            </Button>
          )}
        </div>
      </div>

      {tab === "connections" && (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.length === 0 && !loading && (
            <Card className="p-8 text-center text-muted-foreground md:col-span-2">
              No national or logistics server connected yet.
            </Card>
          )}
          {rows.map((c) => (
            <Card key={c.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{KIND_LABEL[c.kind]}</p>
                  <p className="break-all text-xs text-muted-foreground">{c.base_url}</p>
                </div>
                <Badge variant={c.last_status === "success" ? "default" : c.last_status ? "destructive" : "secondary"}>
                  {c.last_status ?? "not tested"}
                </Badge>
              </div>
              {c.last_sync_at && (
                <p className="text-xs text-muted-foreground">
                  Last exchange {new Date(c.last_sync_at).toLocaleString()}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1" disabled={busy === c.id}
                  onClick={() => void run(c.id, () => testConnection(c.id), "Connection works")}>
                  <PlugZap className="h-4 w-4" /> Test
                </Button>
                {canManage && (
                  <Button size="sm" variant="outline" className="gap-1"
                    onClick={() => { setSecretFor(c); setSecret(""); }}>
                    <KeyRound className="h-4 w-4" /> Access token
                  </Button>
                )}
                {c.kind !== "lmis" && (
                  <Button size="sm" variant="outline" className="gap-1" disabled={busy === c.id}
                    onClick={() => void run(c.id, () => pullMetadata(c.id), "Server details fetched")}>
                    <Download className="h-4 w-4" /> Pull details
                  </Button>
                )}
                {c.kind === "lmis" && (
                  <Button size="sm" variant="outline" className="gap-1" disabled={busy === c.id}
                    onClick={() => void run(c.id, () => pullStock(c.id), "Stock updated")}>
                    <Download className="h-4 w-4" /> Pull stock
                  </Button>
                )}
                {canManage && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing({
                      id: c.id, name: c.name, kind: c.kind, base_url: c.base_url,
                      auth_type: c.auth_type, username: c.username ?? "", org_unit_id: c.org_unit_id ?? "",
                      dataset_id: c.dataset_id ?? "", default_period_type: c.default_period_type,
                      is_active: c.is_active,
                    })}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive"
                      onClick={() => void run(c.id, () => deleteConnection(c.id), "Server removed")}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "indicators" && (
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Server</Label>
              <Select value={activeId} onValueChange={setActiveId}>
                <SelectTrigger className="w-[240px]"><SelectValue placeholder="Choose a server" /></SelectTrigger>
                <SelectContent className="z-[60] bg-popover">
                  {rows.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reporting month (YYYYMM)</Label>
              <Input className="w-[160px]" value={period} onChange={(e) => setPeriod(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            </div>
            {canManage && active?.kind === "dhis2" && (
              <Button className="gap-1" disabled={!activeId || busy === "push"}
                onClick={() => void run("push", () => pushIndicators(
                  activeId, period, values.map((v) => ({ indicator_key: v.key, value: v.value })),
                ), "Figures sent to the national database")}>
                <Upload className="h-4 w-4" /> Send figures
              </Button>
            )}
            {canManage && active?.kind === "fhir" && (
              <Button variant="outline" className="gap-1" disabled={!activeId || busy === "fhir"}
                onClick={() => void run("fhir", () => pushFhirPatients(activeId, []), "Records shared with the FHIR server")}>
                <Upload className="h-4 w-4" /> Share records
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="p-2">Indicator</th><th className="p-2">Count</th><th className="p-2">Linked to</th></tr>
              </thead>
              <tbody>
                {values.map((v) => {
                  const m = mappings.find((x) => x.indicator_key === v.key);
                  return (
                    <tr key={v.key} className="border-t">
                      <td className="p-2">{v.label}</td>
                      <td className="p-2 font-semibold">{v.value}</td>
                      <td className="p-2">
                        <Input
                          className="h-8 w-[220px]"
                          placeholder="Code on the national server"
                          defaultValue={m?.remote_id ?? ""}
                          disabled={!canManage || !activeId}
                          onBlur={async (e) => {
                            const remote_id = e.target.value.trim();
                            if (!remote_id || remote_id === m?.remote_id) return;
                            await saveMapping({
                              connection_id: activeId, indicator_key: v.key,
                              indicator_label: v.label, remote_id,
                            });
                            setMappings(await listMappings(activeId));
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
                {values.length === 0 && (
                  <tr><td className="p-4 text-muted-foreground" colSpan={3}>Nothing recorded for this month yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {REPORTABLE_INDICATORS.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Each figure is counted from this project's own records for the month shown.
            </p>
          )}
        </Card>
      )}

      {tab === "commodities" && (
        <Card className="space-y-3 p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="p-2">Item</th><th className="p-2">Category</th>
                  <th className="p-2">Facility</th><th className="p-2">On hand</th>
                  <th className="p-2">Reorder at</th><th className="p-2">Expires</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => {
                  const low = s.reorder_level != null && s.quantity_on_hand <= s.reorder_level;
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">{s.commodity_name}</td>
                      <td className="p-2 text-muted-foreground">{s.category}</td>
                      <td className="p-2 text-muted-foreground">{s.external_facility_code ?? "—"}</td>
                      <td className="p-2">
                        <span className={low ? "font-semibold text-destructive" : ""}>
                          {s.quantity_on_hand} {s.unit ?? ""}
                        </span>
                      </td>
                      <td className="p-2 text-muted-foreground">{s.reorder_level ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">
                        {s.expiry_date ? new Date(s.expiry_date).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  );
                })}
                {stock.length === 0 && (
                  <tr><td className="p-4 text-muted-foreground" colSpan={6}>
                    No stock pulled yet. Connect a logistics server and choose "Pull stock".
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "logs" && (
        <Card className="p-4">
          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-sm last:border-0">
                <Badge variant={l.status === "success" ? "default" : l.status === "partial" ? "secondary" : "destructive"}>
                  {l.status}
                </Badge>
                <span className="font-medium">{l.action}</span>
                <span className="text-muted-foreground">{l.direction}</span>
                <span className="text-muted-foreground">{l.record_count} records</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleString()}
                </span>
                {l.message && <p className="w-full text-xs text-muted-foreground">{l.message}</p>}
              </div>
            ))}
            {logs.length === 0 && <p className="p-4 text-center text-muted-foreground">No exchanges yet.</p>}
          </div>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit server" : "Add server"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={editing.kind} onValueChange={(v) => setEditing({ ...editing, kind: v as ExchangeKind })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[60] bg-popover">
                    {(Object.keys(KIND_LABEL) as ExchangeKind[]).map((k) => (
                      <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Web address</Label>
                <Input placeholder="https://…" value={editing.base_url}
                  onChange={(e) => setEditing({ ...editing, base_url: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Sign-in method</Label>
                  <Select value={editing.auth_type}
                    onValueChange={(v) => setEditing({ ...editing, auth_type: v as typeof editing.auth_type })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[60] bg-popover">
                      <SelectItem value="bearer">Access token</SelectItem>
                      <SelectItem value="basic">Username &amp; password</SelectItem>
                      <SelectItem value="none">No sign-in</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Username (if needed)</Label>
                  <Input value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Reporting unit code</Label>
                  <Input value={editing.org_unit_id} onChange={(e) => setEditing({ ...editing, org_unit_id: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Dataset code</Label>
                  <Input value={editing.dataset_id} onChange={(e) => setEditing({ ...editing, dataset_id: e.target.value })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={busy === "save"}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!secretFor} onOpenChange={(o) => !o && setSecretFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Access token or password</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This is stored securely on the server and is never shown again.
          </p>
          <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
            placeholder="Paste the token or password" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecretFor(null)}>Cancel</Button>
            <Button disabled={!secret.trim() || busy === "secret"}
              onClick={() => void run("secret", async () => {
                await saveCredential(secretFor!.id, secret.trim());
                setSecretFor(null); setSecret("");
              }, "Saved securely")}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
