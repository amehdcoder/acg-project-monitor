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
  Plus, RefreshCw, Trash2, KeyRound, PlugZap, Download, Upload, Boxes, ScrollText, FileCheck2, Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  KIND_LABEL, REPORTABLE_INDICATORS,
  listConnections, saveConnection, deleteConnection,
  listLogs, listStock, listMappings, saveMapping,
  saveCredential, testConnection, pullMetadata, pullStock, pushIndicators, pushFhirPatients,
  pullFhir, computeIndicatorValues, listBeneficiariesForExchange, previewAggregatePayload,
  pushAggregatePayload, pullSdmxStructure, pullSdmxData, validateImportedPayload,
  pushMonthly, pullStockCategory, pushStock,
  type ExchangeConnection, type ExchangeKind, type ExchangeLog,
  type CommodityStock, type ExchangeMapping, type ExchangeFormat, type ExchangeAuthType,
} from "@/lib/programmeModule/healthExchange";
import { buildSdmxCsv, buildSdmxJson } from "@/lib/programmeModule/exchangeStandards";
import { Switch } from "@/components/ui/switch";
import Dhis2InstanceBrowser from "./Dhis2InstanceBrowser";
import Dhis2LoginPanel from "./Dhis2LoginPanel";
import type { Dhis2Catalog } from "@/lib/programmeModule/healthExchange";

interface Props {
  projectId: string;
  /** Only administrators may configure servers and push data. */
  canManage?: boolean;
}

type Tab = "connections" | "indicators" | "commodities" | "logs";

const EMPTY = {
  name: "", kind: "dhis2" as ExchangeKind, base_url: "",
  auth_type: "bearer" as ExchangeAuthType,
  username: "", org_unit_id: "", dataset_id: "", default_period_type: "Monthly", is_active: true,
  exchange_format: "json" as ExchangeFormat, token_url: "", agency_id: "", dataflow_id: "",
  dataflow_version: "1.0", dsd_id: "", default_dimensions: {} as Record<string, string>,
  auto_push_enabled: false, auto_push_day: 5, auto_push_dry_run: false, lmis_program_id: "",
};

function lastMonth() {
  const d = new Date();
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return `${p.getUTCFullYear()}${String(p.getUTCMonth() + 1).padStart(2, "0")}`;
}

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
  const [people, setPeople] = useState<{ id: string; case_id: string; full_name: string }[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [lmisPath, setLmisPath] = useState("api/stockCardSummaries");
  const [fhirQuery, setFhirQuery] = useState("Patient?_count=50");
  const [standardFormat, setStandardFormat] = useState<ExchangeFormat>("adx-xml");
  const [payloadPreview, setPayloadPreview] = useState("");
  const [importResult, setImportResult] = useState("");
  const [sdmxQuery, setSdmxQuery] = useState("");
  const [sdmxExportFormat, setSdmxExportFormat] = useState<"sdmx-json" | "sdmx-csv">("sdmx-csv");
  const [lmisId, setLmisId] = useState("");
  const [stockCategory, setStockCategory] = useState<"all" | "surgical_consumable" | "morbidity_kit">("all");
  const [dhisCatalog, setDhisCatalog] = useState<Dhis2Catalog | null>(null);

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

  useEffect(() => {
    if (!projectId || active?.kind !== "fhir") return;
    listBeneficiariesForExchange(projectId).then(setPeople).catch(() => setPeople([]));
  }, [active?.kind, projectId]);

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

  const aggregateValues = values.map((value) => ({ indicator_key: value.key, value: value.value }));

  const previewStandard = async () => {
    if (!activeId) return;
    await run("preview-standard", async () => {
      const result = await previewAggregatePayload(activeId, period, aggregateValues, standardFormat);
      setPayloadPreview(result.content ?? "");
      return result;
    }, "Payload validated");
  };

  const downloadPreview = () => {
    if (!payloadPreview) return;
    const extension = standardFormat === "adx-xml" ? "xml" : standardFormat === "sdmx-json" ? "json" : "csv";
    const blob = new Blob([payloadPreview], { type: standardFormat === "adx-xml" ? "application/xml" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `national-report-${period}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /** Build an SDMX file in the browser from this month's figures — no server needed. */
  const downloadSdmx = () => {
    try {
      const observations = values.map((v) => {
        const m = mappings.find((x) => x.indicator_key === v.key);
        const [base, sex] = v.key.split(":");
        return {
          indicatorKey: v.key,
          remoteId: m?.remote_id && m.remote_id !== "UNMAPPED" ? m.remote_id : base.toUpperCase(),
          value: v.value,
          dimensions: { SEX: sex === "female" ? "F" : sex === "male" ? "M" : "_T", ...(m?.dimensions ?? {}) },
        };
      });
      const iso = `${period.slice(0, 4)}-${period.slice(4, 6)}`;
      const input = {
        agencyId: active?.agency_id || "HANDS",
        dataflowId: active?.dataflow_id || active?.dataset_id || "NTD_NATIONAL_INDICATORS",
        dataflowVersion: active?.dataflow_version || "1.0",
        period: iso, observations,
        defaults: { FREQ: "M", REF_AREA: active?.org_unit_id || "NG", ...(active?.default_dimensions ?? {}) },
      };
      const content = sdmxExportFormat === "sdmx-json" ? buildSdmxJson(input) : buildSdmxCsv(input);
      const blob = new Blob([content], { type: sdmxExportFormat === "sdmx-json" ? "application/json" : "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `national-indicators-${period}.sdmx.${sdmxExportFormat === "sdmx-json" ? "json" : "csv"}`;
      a.click();
      URL.revokeObjectURL(url);
      setPayloadPreview(content);
      setStandardFormat(sdmxExportFormat);
    } catch (e: any) {
      toast({ title: "Could not build the SDMX file", description: e.message, variant: "destructive" });
    }
  };

  const lmisRows = rows.filter((r) => r.kind === "lmis");
  const lmis = lmisRows.find((r) => r.id === lmisId) ?? lmisRows[0] ?? null;
  const visibleStock = stockCategory === "all" ? stock : stock.filter((s) => s.category === stockCategory);

  const saveAuto = async (patch: Partial<ExchangeConnection>) => {
    if (!active) return;
    await run("auto", () => saveConnection({ ...active, ...patch }), "Monthly reporting updated");
  };

  const validateImport = async (file: File) => {
    if (!activeId) return;
    const content = await file.text();
    await run("import-standard", async () => {
      const result = await validateImportedPayload(activeId, standardFormat, content);
      setImportResult(`${result.validation?.observationCount ?? 0} observations passed validation`);
      setPayloadPreview(content);
      return result;
    }, "Imported file is valid");
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

      {tab === "connections" && canManage && (
        <Dhis2LoginPanel
          projectId={projectId}
          existing={rows.find((r) => r.kind === "dhis2") ?? null}
          onSignedIn={(r) => { setActiveId(r.connection_id); void reload(); }}
        />
      )}

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
                {c.kind === "dhis2" && (
                  <Button size="sm" variant="outline" className="gap-1" disabled={busy === c.id}
                    onClick={() => void run(c.id, () => pullMetadata(c.id), "Server details fetched")}>
                    <Download className="h-4 w-4" /> Pull details
                  </Button>
                )}
                {c.kind === "sdmx" && (
                  <Button size="sm" variant="outline" className="gap-1" disabled={busy === c.id}
                    onClick={() => void run(c.id, () => pullSdmxStructure(c.id), "SDMX structure received")}>
                    <Download className="h-4 w-4" /> Pull structure
                  </Button>
                )}
                {c.kind === "lmis" && (
                  <Button size="sm" variant="outline" className="gap-1" disabled={busy === c.id}
                    onClick={() => void run(c.id, () => pullStock(c.id, lmisPath), "Stock updated")}>
                    <Download className="h-4 w-4" /> Pull stock
                  </Button>
                )}
                {canManage && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing({
                      id: c.id, name: c.name, kind: c.kind, base_url: c.base_url,
                      auth_type: c.auth_type, username: c.username ?? "", org_unit_id: c.org_unit_id ?? "",
                      dataset_id: c.dataset_id ?? "", default_period_type: c.default_period_type,
                      is_active: c.is_active, exchange_format: c.exchange_format ?? "json",
                      token_url: c.token_url ?? "", agency_id: c.agency_id ?? "", dataflow_id: c.dataflow_id ?? "",
                      dataflow_version: c.dataflow_version ?? "1.0", dsd_id: c.dsd_id ?? "",
                      default_dimensions: c.default_dimensions ?? {},
                      auto_push_enabled: !!c.auto_push_enabled, auto_push_day: c.auto_push_day ?? 5,
                      auto_push_dry_run: !!c.auto_push_dry_run, lmis_program_id: c.lmis_program_id ?? "",
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
              <div className="flex gap-2">
                <Button variant="outline" className="gap-1" disabled={!activeId || busy === "validate"}
                  onClick={() => void run("validate", () => pushIndicators(
                    activeId, period, values.map((v) => ({ indicator_key: v.key, value: v.value })), undefined, true,
                  ), "DHIS2 accepted the validation check")}>
                  <PlugZap className="h-4 w-4" /> Validate
                </Button>
                <Button className="gap-1" disabled={!activeId || busy === "push"}
                  onClick={() => void run("push", () => pushIndicators(
                    activeId, period, values.map((v) => ({ indicator_key: v.key, value: v.value })),
                  ), "Figures sent to the national database")}>
                  <Upload className="h-4 w-4" /> Send figures
                </Button>
              </div>
            )}
          </div>

          {active?.kind === "fhir" && (
            <div className="grid gap-4 border-t pt-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Beneficiaries to share</Label>
                <div className="max-h-56 overflow-y-auto rounded-md border p-2">
                  {people.map((person) => (
                    <label key={person.id} className="flex min-h-10 cursor-pointer items-center gap-2 border-b px-2 last:border-0">
                      <input type="checkbox" checked={selectedPeople.includes(person.id)}
                        onChange={(e) => setSelectedPeople((current) => e.target.checked
                          ? [...current, person.id]
                          : current.filter((id) => id !== person.id))} />
                      <span className="text-sm">{person.full_name} · {person.case_id}</span>
                    </label>
                  ))}
                </div>
                {canManage && (
                  <Button className="gap-1" disabled={selectedPeople.length === 0 || busy === "fhir"}
                    onClick={() => void run("fhir", () => pushFhirPatients(activeId, selectedPeople), "Records shared with the FHIR server")}>
                    <Upload className="h-4 w-4" /> Share {selectedPeople.length || "selected"} records
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Label>FHIR R4 search</Label>
                <Input value={fhirQuery} onChange={(e) => setFhirQuery(e.target.value)} placeholder="Patient?_count=50" />
                <Button variant="outline" className="gap-1" disabled={busy === "fhir-pull"}
                  onClick={() => void run("fhir-pull", () => pullFhir(activeId, fhirQuery), "FHIR records received")}>
                  <Download className="h-4 w-4" /> Pull records
                </Button>
              </div>
            </div>
          )}

          {(active?.kind === "dhis2" || active?.kind === "sdmx") && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label>Exchange standard</Label>
                  <Select value={standardFormat} onValueChange={(value) => { setStandardFormat(value as ExchangeFormat); setPayloadPreview(""); }}>
                    <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[60] bg-popover">
                      {active.kind === "dhis2" && <SelectItem value="adx-xml">IHE ADX XML</SelectItem>}
                      {active.kind === "sdmx" && <SelectItem value="sdmx-json">SDMX-JSON 2.0</SelectItem>}
                      {active.kind === "sdmx" && <SelectItem value="sdmx-csv">SDMX-CSV 2.0</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" className="gap-1" disabled={busy === "preview-standard"} onClick={() => void previewStandard()}>
                  <Eye className="h-4 w-4" /> Validate &amp; preview
                </Button>
                <Button variant="outline" className="gap-1" disabled={!payloadPreview} onClick={downloadPreview}>
                  <Download className="h-4 w-4" /> Download
                </Button>
                <Button asChild variant="outline" className="gap-1">
                  <label>
                    <FileCheck2 className="h-4 w-4" /> Import &amp; validate
                    <input type="file" className="hidden" accept=".xml,.json,.csv,text/xml,application/json,text/csv"
                      onChange={(event) => { const file = event.target.files?.[0]; if (file) void validateImport(file); event.target.value = ""; }} />
                  </label>
                </Button>
                {canManage && (
                  <Button className="gap-1" disabled={busy === "push-standard"}
                    onClick={() => void run("push-standard", () => pushAggregatePayload(activeId, period, aggregateValues, standardFormat), "Standards report accepted")}>
                    <Upload className="h-4 w-4" /> Transmit
                  </Button>
                )}
              </div>
              {importResult && <p className="text-xs text-muted-foreground">{importResult}</p>}
              {payloadPreview && (
                <pre className="max-h-72 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-all">{payloadPreview}</pre>
              )}
              {active.kind === "sdmx" && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[260px] flex-1 space-y-1">
                    <Label>SDMX data query</Label>
                    <Input value={sdmxQuery} onChange={(event) => setSdmxQuery(event.target.value)} placeholder={`data/${active.dataflow_id ?? "dataflow"}/all`} />
                  </div>
                  <Button variant="outline" className="gap-1" disabled={busy === "sdmx-pull"}
                    onClick={() => void run("sdmx-pull", () => pullSdmxData(activeId, sdmxQuery || undefined), "SDMX observations received")}>
                    <Download className="h-4 w-4" /> Pull observations
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-3">
            <div className="mr-auto">
              <p className="text-sm font-semibold">Download SDMX report</p>
              <p className="text-xs text-muted-foreground">Monthly totals and female/male breakdowns for {period}, ready to check before sending.</p>
            </div>
            <Select value={sdmxExportFormat} onValueChange={(v) => setSdmxExportFormat(v as "sdmx-json" | "sdmx-csv")}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[60] bg-popover">
                <SelectItem value="sdmx-csv">SDMX-CSV 2.0</SelectItem>
                <SelectItem value="sdmx-json">SDMX-JSON 2.0</SelectItem>
              </SelectContent>
            </Select>
            <Button className="gap-1" disabled={values.length === 0} onClick={downloadSdmx}>
              <Download className="h-4 w-4" /> Download SDMX
            </Button>
          </div>

          {active?.kind === "dhis2" && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="mr-auto">
                  <p className="text-sm font-semibold">Monthly automatic reporting</p>
                  <p className="text-xs text-muted-foreground">
                    Sends last month's totals and breakdowns to DHIS2 on the chosen day.
                    {active.last_auto_period ? ` Last month sent: ${active.last_auto_period}.` : " Nothing sent automatically yet."}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={!!active.auto_push_enabled} disabled={!canManage || busy === "auto"}
                    onCheckedChange={(v) => void saveAuto({ auto_push_enabled: v })} /> On
                </label>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label>Send on day</Label>
                  <Input type="number" min={1} max={28} className="w-[90px]" defaultValue={active.auto_push_day ?? 5}
                    disabled={!canManage} key={`day-${active.id}`}
                    onBlur={(e) => { const d = Math.min(28, Math.max(1, Number(e.target.value) || 5)); if (d !== active.auto_push_day) void saveAuto({ auto_push_day: d }); }} />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <Switch checked={!!active.auto_push_dry_run} disabled={!canManage || busy === "auto"}
                    onCheckedChange={(v) => void saveAuto({ auto_push_dry_run: v })} /> Practice run only
                </label>
                {canManage && (
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" disabled={busy === "monthly-dry"}
                      onClick={() => void run("monthly-dry", () => pushMonthly(active.id, lastMonth(), true), "DHIS2 checked last month's report")}>
                      Check {lastMonth()}
                    </Button>
                    <Button disabled={busy === "monthly"}
                      onClick={() => void run("monthly", () => pushMonthly(active.id, lastMonth()), "Last month sent to DHIS2")}>
                      <Upload className="h-4 w-4" /> Send {lastMonth()} now
                    </Button>
                  </div>
                )}
              </div>
              {!active.org_unit_id && <p className="text-xs text-destructive">Set the reporting unit code on this server before automatic sending can work.</p>}
            </div>
          )}

          {active?.kind === "dhis2" && (
            <Dhis2InstanceBrowser
              connection={active}
              canManage={canManage}
              onCatalog={setDhisCatalog}
              onSaveTarget={async (patch) => {
                const saved = await saveConnection({ ...active, ...patch });
                setRows((rs) => rs.map((r) => (r.id === saved.id ? saved : r)));
              }}
            />
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="p-2">Indicator</th><th className="p-2">Count</th><th className="p-2">Linked to</th></tr>
              </thead>
              <tbody>
                {values.map((v) => {
                  const m = mappings.find((x) => x.indicator_key === v.key);
                  const liveSet = active?.kind === "dhis2" ? dhisCatalog?.dataSets.find((d) => d.id === active.dataset_id) : undefined;
                  const liveEl = liveSet?.dataElements.find((e) => e.id === m?.remote_id);
                  return (
                    <tr key={v.key} className="border-t">
                      <td className="p-2">{v.label}</td>
                      <td className="p-2 font-semibold">{v.value}</td>
                      <td className="p-2">
                        {liveSet ? (
                          <div className="space-y-1">
                            <Select value={liveEl ? liveEl.id : ""} disabled={!canManage}
                              onValueChange={async (remote_id) => {
                                const el = liveSet.dataElements.find((e) => e.id === remote_id);
                                const coc = el?.categoryOptionCombos.length === 1 ? el.categoryOptionCombos[0].id : null;
                                await saveMapping({ connection_id: activeId, indicator_key: v.key, indicator_label: v.label, remote_id, remote_name: el?.name ?? null, category_option_combo: coc } as any);
                                setMappings(await listMappings(activeId));
                              }}>
                              <SelectTrigger className="h-8 w-[280px]">
                                <SelectValue placeholder={m?.remote_id && m.remote_id !== "UNMAPPED" ? `Code ${m.remote_id} (not in this report)` : "Choose DHIS2 data element"} />
                              </SelectTrigger>
                              <SelectContent className="max-h-80">
                                {liveSet.dataElements.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {liveEl && liveEl.categoryOptionCombos.length > 0 && (
                              <Select value={m?.category_option_combo ?? ""} disabled={!canManage}
                                onValueChange={async (coc) => {
                                  await saveMapping({ connection_id: activeId, indicator_key: v.key, indicator_label: v.label, remote_id: liveEl.id, category_option_combo: coc } as any);
                                  setMappings(await listMappings(activeId));
                                }}>
                                <SelectTrigger className="h-8 w-[280px]"><SelectValue placeholder="Choose breakdown" /></SelectTrigger>
                                <SelectContent className="max-h-80">
                                  {liveEl.categoryOptionCombos.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        ) : (
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
                        )}

                        {active?.kind === "dhis2" && !liveSet && (
                          <Input
                            className="mt-1 h-8 w-[220px]"
                            placeholder="Category option combo (breakdown)"
                            defaultValue={m?.category_option_combo ?? ""}
                            key={`coc-${activeId}-${m?.id ?? v.key}`}
                            disabled={!canManage || !activeId || !m}
                            onBlur={async (e) => {
                              const coc = e.target.value.trim() || null;
                              if (!m || coc === (m.category_option_combo ?? null)) return;
                              await saveMapping({ connection_id: activeId, indicator_key: v.key, indicator_label: v.label, remote_id: m.remote_id, category_option_combo: coc });
                              setMappings(await listMappings(activeId));
                            }}
                          />
                        )}
                        {(active?.kind === "sdmx" || standardFormat === "adx-xml") && (
                          <Input
                            className="mt-1 h-8 w-[220px]"
                            placeholder={active?.kind === "sdmx" ? "Dimensions: FREQ=M,REF_AREA=NG" : "Disaggregation: sex=F,age=15-49"}
                            defaultValue={Object.entries(m?.dimensions ?? {}).map(([key, value]) => `${key}=${value}`).join(",")}
                            disabled={!canManage || !activeId}
                            onBlur={async (event) => {
                              const dimensions = Object.fromEntries(event.target.value.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
                                const separator = part.indexOf("=");
                                return separator > 0 ? [part.slice(0, separator).trim(), part.slice(separator + 1).trim()] : [part, ""];
                              }).filter(([, value]) => value));
                              await saveMapping({ connection_id: activeId, indicator_key: v.key, indicator_label: v.label, remote_id: m?.remote_id ?? "UNMAPPED", dimensions });
                              setMappings(await listMappings(activeId));
                            }}
                          />
                        )}
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
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label>Logistics server</Label>
              <Select value={lmis?.id ?? ""} onValueChange={setLmisId}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Add an LMIS server first" /></SelectTrigger>
                <SelectContent className="z-[60] bg-popover">
                  {lmisRows.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Items</Label>
              <Select value={stockCategory} onValueChange={(v) => setStockCategory(v as typeof stockCategory)}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[60] bg-popover">
                  <SelectItem value="all">All items</SelectItem>
                  <SelectItem value="surgical_consumable">Surgical consumables</SelectItem>
                  <SelectItem value="morbidity_kit">Morbidity kits</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[220px] flex-1 space-y-1">
              <Label>OpenLMIS stock path</Label>
              <Input value={lmisPath} onChange={(e) => setLmisPath(e.target.value)} placeholder="api/stockCardSummaries" />
            </div>
          </div>
          {lmis && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-1" disabled={busy === "lmis-test"}
                onClick={() => void run("lmis-test", () => testConnection(lmis.id, `${lmisPath}?page=0&size=1`), "OpenLMIS endpoint works")}>
                <PlugZap className="h-4 w-4" /> Test
              </Button>
              <Button variant="outline" className="gap-1" disabled={busy === "lmis-pull"}
                onClick={() => void run("lmis-pull", () => pullStockCategory(lmis.id, lmisPath, stockCategory === "all" ? undefined : stockCategory), "Stock pulled from OpenLMIS")}>
                <Download className="h-4 w-4" /> Pull {stockCategory === "all" ? "stock" : stockCategory === "surgical_consumable" ? "consumables" : "kits"}
              </Button>
              {canManage && (
                <Button className="gap-1" disabled={busy === "lmis-push"}
                  onClick={() => void run("lmis-push", () => pushStock(lmis.id, stockCategory === "all" ? undefined : stockCategory), "Stock counts sent to OpenLMIS")}>
                  <Upload className="h-4 w-4" /> Push counts
                </Button>
              )}
              {(!lmis.lmis_program_id && !lmis.dataset_id) && (
                <p className="w-full text-xs text-destructive">Add the OpenLMIS programme ID and facility ID on this server (Edit) before pushing.</p>
              )}
            </div>
          )}
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
                {visibleStock.map((s) => {
                  const low = s.reorder_level != null && s.quantity_on_hand <= s.reorder_level;
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">{s.commodity_name}</td>
                      <td className="p-2 text-muted-foreground">{s.category === "surgical_consumable" ? "Surgical consumable" : s.category === "morbidity_kit" ? "Morbidity kit" : s.category}</td>
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
                {visibleStock.length === 0 && (
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
                    <SelectItem value="bearer">Personal access / OAuth token</SelectItem>
                      <SelectItem value="apitoken">DHIS2 personal access token</SelectItem>
                      <SelectItem value="oauth2_client_credentials">OpenLMIS OAuth client</SelectItem>
                      <SelectItem value="basic">Username &amp; password</SelectItem>
                      <SelectItem value="none">No sign-in</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editing.auth_type === "oauth2_client_credentials" && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label>OAuth token address</Label>
                    <Input value={editing.token_url} onChange={(e) => setEditing({ ...editing, token_url: e.target.value })} />
                  </div>
                )}
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
              {editing.kind === "lmis" && (
                <div className="space-y-1">
                  <Label>OpenLMIS programme ID</Label>
                  <Input value={editing.lmis_program_id} placeholder="Programme UUID (reporting unit code = facility UUID)"
                    onChange={(e) => setEditing({ ...editing, lmis_program_id: e.target.value })} />
                </div>
              )}
              {editing.kind === "sdmx" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label>Agency ID</Label><Input value={editing.agency_id} onChange={(e) => setEditing({ ...editing, agency_id: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Dataflow ID</Label><Input value={editing.dataflow_id} onChange={(e) => setEditing({ ...editing, dataflow_id: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Dataflow version</Label><Input value={editing.dataflow_version} onChange={(e) => setEditing({ ...editing, dataflow_version: e.target.value })} /></div>
                  <div className="space-y-1"><Label>DSD ID</Label><Input value={editing.dsd_id} onChange={(e) => setEditing({ ...editing, dsd_id: e.target.value })} /></div>
                </div>
              )}
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
