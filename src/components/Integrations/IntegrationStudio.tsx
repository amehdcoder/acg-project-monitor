import { useEffect, useMemo, useState } from "react";
import {
  Plug, Plus, Search, FileText, Users, ArrowRight, ArrowLeft, ArrowLeftRight, Upload, Download,
  Sparkles, Check, Copy, Trash2, Loader2, Wand2, Globe, Database, Sheet, Building2, Smartphone, Cloud, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { generateApiKey, generateWebhookSecret, sha256Hex } from "@/lib/integrations/apiKeys";
import { discoverFields, autoMap, mirrorRecord, type MapField, type FieldMap } from "@/lib/integrations/fieldMapping";
import { buildLbrApiSpec } from "@/lib/integrations/lbrApiSpec";
import type { ProgrammeModuleConfig } from "@/lib/programmeModule/types";

type Project = { id: string; name: string };
type Target = { type: "form" | "records"; id: string; name: string; projectId: string; raw: unknown };
type Direction = "push" | "pull" | "both";
type Conn = {
  id: string; name: string; app_kind: string; direction: string; base_url: string | null; target_type: string;
  target_label: string | null; project_id: string; mappings: FieldMap[]; is_active: boolean; created_at: string;
};

const APPS = [
  { id: "kobo", name: "KoboToolbox", icon: Smartphone, hint: "Field surveys" },
  { id: "odk", name: "ODK / Ona", icon: Smartphone, hint: "Mobile data collection" },
  { id: "dhis2", name: "DHIS2", icon: Building2, hint: "Health information" },
  { id: "commcare", name: "CommCare", icon: Users, hint: "Case management" },
  { id: "sheets", name: "Spreadsheet / Airtable", icon: Sheet, hint: "Tables and lists" },
  { id: "crm", name: "CRM / Salesforce", icon: Cloud, hint: "Partners and donors" },
  { id: "database", name: "Database / Data warehouse", icon: Database, hint: "Analytics stores" },
  { id: "custom", name: "Any other app", icon: Globe, hint: "Anything with a web address" },
];
const DIRECTIONS: { id: Direction; label: string; text: string; icon: typeof Upload }[] = [
  { id: "push", label: "Send from Amehnities", text: "New and updated entries go to the other app automatically.", icon: Upload },
  { id: "pull", label: "Receive into Amehnities", text: "The other app sends its entries into Amehnities.", icon: Download },
  { id: "both", label: "Both ways", text: "Keep both systems in step.", icon: ArrowLeftRight },
];
const STEPS = ["Choose app", "Link to Amehnities", "Their fields", "Match fields", "Finish"];

type Q = { name?: string; id?: string; key?: string; label?: string; title?: string; question?: string; type?: string; questions?: Q[]; children?: Q[]; fields?: Q[] };
function formFields(questions: unknown): MapField[] {
  const out: MapField[] = [];
  const walk = (list: unknown, group?: string) => {
    if (!Array.isArray(list)) return;
    for (const q of list as Q[]) {
      if (!q || typeof q !== "object") continue;
      const key = q.name || q.key || q.id; const label = q.label || q.title || q.question || key;
      const kids = q.questions || q.children || q.fields;
      if (kids?.length) walk(kids, String(label || group || ""));
      else if (key && q.type !== "note") out.push({ key: String(key), label: String(label), type: q.type, group: group || "Form questions" });
    }
  };
  walk(questions);
  return out;
}
function recordFields(config: unknown, name: string): MapField[] {
  try {
    const spec = buildLbrApiSpec({ config: config as ProgrammeModuleConfig, moduleName: name, projectName: "", supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "" });
    const f = (x: { key: string; label: string; type: string }, group: string, prefix = "") => ({ key: prefix + x.key, label: x.label, type: x.type, group });
    return [
      ...spec.coreFields.filter((x) => !["id", "version", "created_at", "updated_at", "profile"].includes(x.key)).map((x) => f(x, "Person")),
      ...spec.profileFields.map((x) => f(x, "Profile", "profile.")),
      ...spec.serviceFields.filter((x) => !["id", "beneficiary_id", "created_at", "data"].includes(x.key)).map((x) => f(x, "Service", "service.")),
      ...spec.components.flatMap((c) => c.extraFields.map((x) => f(x, c.label, `service.data.`))),
    ];
  } catch { return []; }
}

const SAMPLE = `{\n  "patient_name": "Aisha Bello",\n  "mobile": "08031234567",\n  "gender": "female",\n  "district": "Gumel",\n  "visit_date": "2026-11-20"\n}`;

const IntegrationStudio = ({ projects }: { projects: Project[] }) => {
  const [open, setOpen] = useState(false);
  const [conns, setConns] = useState<Conn[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Project";

  const loadConns = async () => {
    setLoadingList(true);
    const { data } = await supabase.from("integration_connections")
      .select("id, name, app_kind, direction, base_url, target_type, target_label, project_id, mappings, is_active, created_at")
      .order("created_at", { ascending: false }).limit(200);
    setConns((data as unknown as Conn[]) ?? []);
    setLoadingList(false);
  };
  useEffect(() => { loadConns(); }, []);

  const toggle = async (c: Conn) => {
    await supabase.from("integration_connections").update({ is_active: !c.is_active, updated_at: new Date().toISOString() }).eq("id", c.id);
    loadConns();
  };
  const remove = async (c: Conn) => {
    if (!confirm(`Remove the connection "${c.name}"?`)) return;
    const { error } = await supabase.from("integration_connections").delete().eq("id", c.id);
    if (error) toast({ title: "Could not remove", description: error.message, variant: "destructive" }); else loadConns();
  };

  return (
    <Card className="overflow-hidden border-0 shadow-card">
      <div className="relative bg-gradient-to-br from-primary/15 via-accent/10 to-transparent p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Plug className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold text-foreground">Connect any app</h2>
            <p className="text-sm text-muted-foreground">Link an outside system to a form or beneficiary records in a few guided steps. Fields are matched for you.</p>
          </div>
          <Button size="lg" className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New connection</Button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {APPS.map((a) => (
            <button key={a.id} type="button" onClick={() => setOpen(true)}
              className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card/70 p-3 text-center text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-card">
              <a.icon className="h-5 w-5 text-primary" />{a.name}
            </button>
          ))}
        </div>
      </div>
      <CardContent className="space-y-3 pt-5">
        <h3 className="text-sm font-semibold text-foreground">Your connections</h3>
        {loadingList ? <p className="text-sm text-muted-foreground">Loading…</p> : conns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No connections yet. Start with “New connection”.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {conns.map((c) => {
              const app = APPS.find((a) => a.id === c.app_kind) ?? APPS[APPS.length - 1];
              const dir = DIRECTIONS.find((d) => d.id === c.direction);
              return (
                <div key={c.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"><app.icon className="h-5 w-5 text-primary" /></div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{app.name} ⇄ {c.target_label || (c.target_type === "form" ? "Form" : "Records")} · {projectName(c.project_id)}</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{dir?.label ?? c.direction}</Badge>
                      <Badge variant="outline">{(c.mappings || []).length} fields matched</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch checked={c.is_active} onCheckedChange={() => toggle(c)} aria-label="Turn connection on or off" />
                    <Button size="icon" variant="ghost" aria-label="Remove connection" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      {open && <ConnectionWizard projects={projects} onClose={() => setOpen(false)} onSaved={() => { loadConns(); }} />}
    </Card>
  );
};

function ConnectionWizard({ projects, onClose, onSaved }: { projects: Project[]; onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState(0);
  const [app, setApp] = useState("custom");
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<Direction>("both");
  const [baseUrl, setBaseUrl] = useState("");
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [searching, setSearching] = useState(true);
  const [target, setTarget] = useState<Target | null>(null);
  const [sample, setSample] = useState("");
  const [autoDetect, setAutoDetect] = useState(true);
  const [maps, setMaps] = useState<FieldMap[]>([]);
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<{ key?: string; secret?: string } | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    (async () => {
      const [f, m] = await Promise.all([
        supabase.from("forms").select("id, name, project_id, questions").order("updated_at", { ascending: false }).limit(1000),
        supabase.from("programme_modules").select("id, name, project_id, config").eq("is_template", false).limit(500),
      ]);
      setTargets([
        ...((m.data ?? []) as { id: string; name: string; project_id: string; config: unknown }[]).map((x) => ({ type: "records" as const, id: x.id, name: x.name, projectId: x.project_id, raw: x.config })),
        ...((f.data ?? []) as { id: string; name: string; project_id: string; questions: unknown }[]).map((x) => ({ type: "form" as const, id: x.id, name: x.name, projectId: x.project_id, raw: x.questions })),
      ]);
      setSearching(false);
    })();
  }, []);

  const pName = (id: string) => projects.find((p) => p.id === id)?.name ?? "";
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return targets.filter((t) => !q || t.name.toLowerCase().includes(q) || pName(t.projectId).toLowerCase().includes(q)).slice(0, 60);
  }, [targets, query, projects]);
  const internal = useMemo(() => !target ? [] : target.type === "form" ? formFields(target.raw) : recordFields(target.raw, target.name), [target]);
  const external = useMemo(() => discoverFields(sample), [sample]);

  useEffect(() => { if (autoDetect) setMaps((cur) => autoMap(external, internal, cur)); }, [external, internal, autoDetect]);

  const setMap = (ext: string, internalKey: string) => setMaps((cur) => {
    const rest = cur.filter((m) => m.external !== ext && (internalKey === "" || m.internal !== internalKey));
    return internalKey ? [...rest, { external: ext, internal: internalKey, confidence: 1, auto: false }] : rest;
  });
  const mirrored = useMemo(() => mirrorRecord(sample, maps), [sample, maps]);
  const labelOf = (k: string) => internal.find((i) => i.key === k)?.label ?? k;
  const groups = useMemo(() => [...new Set(internal.map((i) => i.group || "Fields"))], [internal]);

  const canNext = [
    !!name.trim() && (!baseUrl || /^https:\/\//.test(baseUrl.trim())),
    !!target, external.length > 0, maps.length > 0, true,
  ][step];

  const copy = async (t: string, tag: string) => { await navigator.clipboard.writeText(t); setCopied(tag); setTimeout(() => setCopied(""), 1500); };

  const save = async () => {
    if (!target) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const out: { key?: string; secret?: string } = {};
    let webhookId: string | null = null;
    let apiKeyId: string | null = null;
    try {
      if ((direction === "push" || direction === "both") && target.type === "records" && baseUrl.trim()) {
        const secret = generateWebhookSecret();
        const { data, error } = await supabase.from("webhook_endpoints").insert({
          project_id: target.projectId, url: baseUrl.trim(), description: `${name.trim()} (connection)`,
          secret, events: ["beneficiary.created", "beneficiary.updated", "service.recorded"], created_by: user?.id,
        }).select("id").single();
        if (error) throw error;
        webhookId = data.id; out.secret = secret;
      }
      if (direction === "pull" || direction === "both") {
        const { raw, prefix } = generateApiKey();
        const { data: k, error } = await supabase.from("api_keys").insert({
          project_id: target.projectId, name: `${name.trim()} (connection)`, key_prefix: prefix, key_hash: await sha256Hex(raw),
          scopes: ["records:read", "records:write"], created_by: user?.id,
        }).select("id").single();
        if (error) throw error;
        apiKeyId = k.id;
        out.key = raw;
      }
      const { error } = await supabase.from("integration_connections").insert({
        project_id: target.projectId, name: name.trim(), app_kind: app, direction, base_url: baseUrl.trim() || null,
        target_type: target.type, target_id: target.id, target_label: target.name,
        external_fields: external as never, mappings: maps as never, auto_detect: autoDetect,
        webhook_endpoint_id: webhookId, api_key_id: apiKeyId, created_by: user?.id,
      });
      if (error) throw error;
      setIssued(out); onSaved();
      toast({ title: "Connection saved", description: `${name.trim()} is linked to ${target.name}.` });
    } catch (e) {
      toast({ title: "Could not save the connection", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plug className="h-5 w-5 text-primary" /> New connection</DialogTitle>
          <DialogDescription>Step {step + 1} of {STEPS.length}: {STEPS[step]}</DialogDescription>
        </DialogHeader>
        <ol className="flex gap-1">
          {STEPS.map((s, i) => (
            <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} title={s} />
          ))}
        </ol>

        {step === 0 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {APPS.map((a) => (
                <button key={a.id} type="button" onClick={() => { setApp(a.id); if (!name) setName(a.name); }}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center text-sm transition-colors ${app === a.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                  <a.icon className="h-6 w-6 text-primary" /><span className="font-medium text-foreground">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{a.hint}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Connection name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. State eye clinic system" /></div>
              <div className="space-y-1.5"><Label>Their web address <span className="text-muted-foreground">(optional)</span></Label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://their-app.org/receive" />
                {baseUrl && !/^https:\/\//.test(baseUrl.trim()) && <p className="text-xs text-destructive">Must start with https://</p>}</div>
            </div>
            <div className="space-y-1.5"><Label>Which way should data flow?</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {DIRECTIONS.map((d) => (
                  <button key={d.id} type="button" onClick={() => setDirection(d.id)}
                    className={`rounded-xl border p-3 text-left transition-colors ${direction === d.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                    <d.icon className="mb-1 h-5 w-5 text-primary" /><p className="text-sm font-semibold text-foreground">{d.label}</p>
                    <p className="text-xs text-muted-foreground">{d.text}</p>
                  </button>
                ))}
              </div></div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all forms and beneficiary records by name or project…" />
            </div>
            {searching ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading forms and records…</p> : (
              <div className="grid max-h-[46dvh] gap-2 overflow-y-auto sm:grid-cols-2">
                {results.length === 0 && <p className="text-sm text-muted-foreground">Nothing matches “{query}”.</p>}
                {results.map((t) => (
                  <button key={t.type + t.id} type="button" onClick={() => setTarget(t)}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${target?.id === t.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                    {t.type === "form" ? <FileText className="mt-0.5 h-5 w-5 text-primary" /> : <Users className="mt-0.5 h-5 w-5 text-accent" />}
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.type === "form" ? "Form" : "Beneficiary records"} · {pName(t.projectId) || "Project"}</p></div>
                    {target?.id === t.id && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Paste one example entry from the other app</Label>
              <p className="text-xs text-muted-foreground">Copy a sample record (JSON), or just list their field names one per line.</p>
              <Textarea rows={12} className="font-mono text-xs" value={sample} onChange={(e) => setSample(e.target.value)} placeholder={SAMPLE} />
              <Button type="button" variant="outline" size="sm" onClick={() => setSample(SAMPLE)}>Use an example</Button>
            </div>
            <div className="space-y-2">
              <Label>Fields found ({external.length})</Label>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                {external.length === 0 && <p className="p-3 text-sm text-muted-foreground">Fields will appear here.</p>}
                {external.map((f) => (
                  <div key={f.key} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2 py-1.5 text-sm">
                    <span className="truncate font-medium text-foreground">{f.key}</span>
                    {f.sample && <span className="truncate text-xs text-muted-foreground">{f.sample}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-primary/5 p-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <p className="flex-1 text-sm text-foreground"><b>{maps.length}</b> of {external.length} fields matched to <b>{target?.name}</b>.</p>
              <label className="flex items-center gap-2 text-sm"><Switch checked={autoDetect} onCheckedChange={setAutoDetect} /> Auto-detect</label>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setMaps((cur) => autoMap(external, internal, cur.filter((m) => !m.auto)))}><Wand2 className="h-4 w-4" /> Match again</Button>
            </div>
            {internal.length === 0 && <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">“{target?.name}” has no fields yet. Go back and choose another form or records programme.</p>}
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <div className="max-h-[50dvh] space-y-2 overflow-y-auto pr-1">
                {external.map((e) => {
                  const m = maps.find((x) => x.external === e.key);
                  return (
                    <div key={e.key} className="grid items-center gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_auto_1fr]">
                      <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{e.key}</p>
                        {e.sample && <p className="truncate text-xs text-muted-foreground">e.g. {e.sample}</p>}</div>
                      <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
                      <div className="flex items-center gap-1">
                        <Select value={m?.internal || "__none"} onValueChange={(v) => setMap(e.key, v === "__none" ? "" : v)}>
                          <SelectTrigger className={m ? "border-primary/50" : ""}><SelectValue placeholder="Don't link" /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            <SelectItem value="__none">Don't link</SelectItem>
                            {groups.map((g) => internal.filter((i) => (i.group || "Fields") === g).map((i) => (
                              <SelectItem key={i.key} value={i.key}>{g} · {i.label}</SelectItem>
                            )))}
                          </SelectContent>
                        </Select>
                        {m?.auto && <Badge variant="secondary" className="shrink-0 text-[10px]">Auto {Math.round(m.confidence * 100)}%</Badge>}
                        {m && <Button size="icon" variant="ghost" aria-label="Unlink" onClick={() => setMap(e.key, "")}><X className="h-4 w-4" /></Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-sm font-semibold text-foreground">Preview in Amehnities</p>
                <p className="text-xs text-muted-foreground">How the example entry will look once mirrored.</p>
                {Object.entries(mirrored).length === 0 ? <p className="text-xs text-muted-foreground">Link a field to see it here.</p> :
                  Object.entries(mirrored).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-card px-2 py-1.5"><p className="text-[11px] text-muted-foreground">{labelOf(k)}</p>
                      <p className="truncate text-sm font-medium text-foreground">{v || "—"}</p></div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            {!issued ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[["App", APPS.find((a) => a.id === app)?.name], ["Name", name], ["Direction", DIRECTIONS.find((d) => d.id === direction)?.label],
                  ["Linked to", `${target?.name} (${target?.type === "form" ? "form" : "beneficiary records"})`], ["Fields matched", String(maps.length)], ["Their address", baseUrl || "Not set"]]
                  .map(([k, v]) => <div key={k} className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="text-sm font-semibold text-foreground">{v}</p></div>)}
                {target?.type === "form" && direction !== "pull" && <p className="text-xs text-muted-foreground sm:col-span-2">Automatic sending is available for beneficiary records; for forms, the matching is saved for the other app to use.</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-foreground"><Check className="h-5 w-5 text-primary" /><b>Connected.</b> Share these with the other app's team — they are shown only once.</div>
                {issued.key && <Secret label="Access key (lets their app send and read data)" value={issued.key} tag="k" copied={copied} copy={copy} />}
                {issued.secret && <Secret label="Signing secret (lets their app confirm data came from Amehnities)" value={issued.secret} tag="s" copied={copied} copy={copy} />}
                {issued.key && target?.type === "records" && (
                  <Secret label="Their app sends and reads entries here, using its own field names" value={`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/external-api/v1/connection/records`} tag="u" copied={copied} copy={copy} />
                )}
                {issued.secret && <p className="text-xs text-muted-foreground">New and updated records in “{target?.name}” are sent to {baseUrl} using their field names.</p>}
                {!issued.key && !issued.secret && <p className="text-sm text-muted-foreground">The field matching is saved.</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button variant="ghost" className="gap-1" disabled={step === 0 || !!issued} onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
          {step < 4 ? (
            <Button className="gap-1" disabled={!canNext} onClick={() => setStep(step + 1)}>Next <ArrowRight className="h-4 w-4" /></Button>
          ) : issued ? <Button onClick={onClose}>Done</Button> : (
            <Button className="gap-1" disabled={saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} Connect</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Secret({ label, value, tag, copied, copy }: { label: string; value: string; tag: string; copied: string; copy: (v: string, t: string) => void }) {
  return (
    <div className="space-y-1 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs">{value}</code>
        <Button size="sm" variant="outline" onClick={() => copy(value, tag)}>{copied === tag ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
      </div>
    </div>
  );
}

export default IntegrationStudio;
