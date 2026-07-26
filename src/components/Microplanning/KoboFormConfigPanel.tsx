// Kobo Form Configurations panel — inspect a Kobo form, map its fields to
// microplan_entries columns, or deploy our XLSForm to an empty Kobo form.
//
// Rendered inside KoboSyncSettingsDialog. Admin-only (dialog gate already
// enforces this).

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Search, Rocket, Save, Trash2, PlusCircle, PlugZap, CheckCircle2, XCircle, AlertTriangle, Eye, History } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import KoboMappingHistoryDialog from "./KoboMappingHistoryDialog";


type TestStep = { step: string; ok: boolean; detail?: string };

// Target columns in public.microplan_entries the admin can map to
const TARGET_FIELDS: Array<{ key: string; label: string }> = [
  { key: "project_id", label: "Project ID" },
  { key: "state", label: "State" },
  { key: "lga", label: "LGA" },
  { key: "ward", label: "Ward" },
  { key: "flhf_name", label: "FLHF Name" },
  { key: "flhf_custom", label: "FLHF (Other/Custom)" },
  { key: "flhf_incharge_name", label: "FLHF In-charge Name" },
  { key: "flhf_incharge_phone", label: "FLHF In-charge Phone" },
  { key: "community_name", label: "Community" },
  { key: "community_custom", label: "Community (Other/Custom)" },
  { key: "community_leader_name", label: "Community Leader" },
  { key: "community_leader_phone", label: "Community Leader Phone" },
  { key: "settlement_name", label: "Settlement" },
  { key: "settlement_custom", label: "Settlement (Other/Custom)" },
  { key: "estimated_total_population", label: "Estimated Total Population" },
  { key: "number_of_households", label: "Number of Households" },
];

interface KoboField { name: string; type: string; label: string }
interface FormConfig {
  id: string;
  project_id: string | null;
  kobo_server_url: string;
  form_uid: string;
  form_title: string | null;
  field_mappings: Record<string, string>;
  form_status: string;
  last_inspected_at: string | null;
  last_deployed_at: string | null;
}

interface Project { id: string; name: string }

const invoke = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("kobo-form-manager", { body });
  if (error) {
    // Try to extract server error body
    const msg = (error as any)?.context?.text ? await (error as any).context.text() : error.message;
    throw new Error(msg || "Request failed");
  }
  if (data?.error) throw new Error(data.error);
  return data;
};

export default function KoboFormConfigPanel() {
  const [configs, setConfigs] = useState<FormConfig[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  // Draft form
  const [server, setServer] = useState("https://kf.kobotoolbox.org");
  const [formUid, setFormUid] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [inspecting, setInspecting] = useState(false);
  const [fields, setFields] = useState<KoboField[] | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);
  const [formTitle, setFormTitle] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testSteps, setTestSteps] = useState<TestStep[] | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [submissionCount, setSubmissionCount] = useState<number>(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpenFor, setHistoryOpenFor] = useState<FormConfig | null>(null);


  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: p }, cfgRes] = await Promise.all([
        supabase.from("projects").select("id, name").order("name"),
        invoke({ action: "list_configs" }),
      ]);
      setProjects((p ?? []) as Project[]);
      setConfigs((cfgRes?.configs ?? []) as FormConfig[]);
    } catch (e: any) {
      toast({ title: "Failed to load", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const resetDraft = () => {
    setEditingId(null); setServer("https://kf.kobotoolbox.org");
    setFormUid(""); setApiToken(""); setProjectId("");
    setFields(null); setIsEmpty(false); setFormTitle(null); setMapping({});
    setTestSteps(null); setTestOk(null); setSubmissionCount(0);
  };

  const applyInspectResult = (res: any) => {
    setFields(res.fields ?? []);
    setIsEmpty(Boolean(res.is_empty));
    setFormTitle(res.form_title ?? null);
    setSubmissionCount(Number(res.submission_count ?? 0));
    setTestSteps(res.steps ?? null);
    setTestOk(res.ok !== false);
    // Auto-map by name equality
    const auto: Record<string, string> = {};
    const names = new Set((res.fields ?? []).map((f: KoboField) => f.name));
    for (const t of TARGET_FIELDS) if (names.has(t.key)) auto[t.key] = t.key;
    setMapping((prev) => ({ ...auto, ...prev }));
  };

  const testConnection = async () => {
    if (!formUid.trim() || !apiToken.trim()) {
      toast({ title: "Form UID and API token required", variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestSteps(null); setTestOk(null);
    try {
      const res = await invoke({
        action: "test_connection", server_url: server.trim(), form_uid: formUid.trim(), api_token: apiToken.trim(),
      });
      applyInspectResult(res);
      toast({
        title: res.ok ? "Kobo connection verified" : "Connection failed",
        description: res.ok
          ? `${res.form_title ?? formUid.trim()} · ${res.fields?.length ?? 0} question(s)`
          : (res.steps?.find((s: TestStep) => !s.ok)?.detail ?? "See details below."),
        variant: res.ok ? "default" : "destructive",
      });
    } catch (e: any) {
      setTestOk(false);
      setTestSteps([{ step: "request", ok: false, detail: e.message }]);
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const inspect = testConnection;

  const deploySchema = async (force = false) => {
    setDeploying(true);
    try {
      const res = await invoke({
        action: "deploy", force,
        server_url: server.trim(), form_uid: formUid.trim(), api_token: apiToken.trim(),
      });
      if (res?.error === "refused_form_not_empty" || res?.error === "refused_has_submissions") {
        // Should not reach — invoke() throws on data.error. Left as belt-and-braces.
        throw new Error(res.detail ?? res.error);
      }
      toast({ title: "Microplanning schema deployed to Kobo form" });
      await testConnection();
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("refused_form_not_empty")) {
        if (confirm(`This Kobo form already has questions. Deploying will OVERWRITE them.\n\nContinue anyway?`)) {
          return deploySchema(true);
        }
      } else if (msg.includes("refused_has_submissions")) {
        if (confirm(`This Kobo form already has submissions. Deploying will OVERWRITE its schema.\n\nContinue anyway?`)) {
          return deploySchema(true);
        }
      } else {
        toast({ title: "Deploy failed", description: msg, variant: "destructive" });
      }
    } finally {
      setDeploying(false);
    }
  };

  const saveConfig = async () => {
    if (!formUid.trim() || !apiToken.trim()) {
      toast({ title: "Form UID and API token required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const cleanMapping = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
      const res: any = await invoke({
        action: "save_config",
        id: editingId,
        server_url: server.trim(),
        form_uid: formUid.trim(),
        form_title: formTitle,
        api_token: apiToken.trim(),
        project_id: projectId || null,
        field_mappings: cleanMapping,
        form_status: isEmpty ? "deployed" : "existing",
      });
      // Log a mapping version snapshot for the audit trail
      const savedId = res?.config?.id ?? editingId;
      if (savedId) {
        try {
          await invoke({
            action: "save_mapping_version",
            config_id: savedId,
            field_mappings: cleanMapping,
            change_summary: editingId ? "Manual mapping update" : "Initial mapping",
          });
        } catch (histErr: any) {
          console.warn("[Kobo] mapping version snapshot failed:", histErr?.message);
        }
      }
      toast({ title: "Configuration saved" });
      resetDraft();
      await loadAll();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };


  const deleteConfig = async (id: string) => {
    if (!confirm("Delete this Kobo form configuration?")) return;
    try {
      await invoke({ action: "delete_config", id });
      toast({ title: "Configuration deleted" });
      await loadAll();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  const editConfig = (c: FormConfig) => {
    setEditingId(c.id);
    setServer(c.kobo_server_url);
    setFormUid(c.form_uid);
    setApiToken("");
    setProjectId(c.project_id ?? "");
    setFormTitle(c.form_title);
    setMapping(c.field_mappings ?? {});
    setFields(null);
    toast({ title: "Editing configuration", description: "Enter the API token and click Inspect to reload fields." });
  };

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-card">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold flex items-center gap-2">
          <PlusCircle className="h-4 w-4 text-primary" />
          Kobo Form Configurations
        </div>
        {editingId && (
          <Button size="sm" variant="ghost" onClick={resetDraft}>Cancel edit</Button>
        )}
      </div>

      {/* Existing configs list */}
      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : configs.length > 0 && (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-2 py-1">Form UID</th>
                <th className="px-2 py-1">Title</th>
                <th className="px-2 py-1">Project</th>
                <th className="px-2 py-1">Mapped</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-2 py-1 font-mono">{c.form_uid}</td>
                  <td className="px-2 py-1">{c.form_title ?? "—"}</td>
                  <td className="px-2 py-1">
                    {projects.find((p) => p.id === c.project_id)?.name ?? "—"}
                  </td>
                  <td className="px-2 py-1">
                    <Badge variant="secondary">{Object.keys(c.field_mappings ?? {}).length} fields</Badge>
                  </td>
                  <td className="px-2 py-1 text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => editConfig(c)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteConfig(c.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Draft */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Kobo Server URL</Label>
          <Input value={server} onChange={(e) => setServer(e.target.value)} className="text-xs" />
        </div>
        <div>
          <Label className="text-[10px]">Form UID</Label>
          <Input value={formUid} onChange={(e) => setFormUid(e.target.value)} className="text-xs font-mono" placeholder="aV5Yd5JLgUqDazk7hU6DJ7" />
        </div>
        <div>
          <Label className="text-[10px]">API Token</Label>
          <Input value={apiToken} onChange={(e) => setApiToken(e.target.value)} type="password" className="text-xs font-mono" placeholder="Kobo account settings → API token" />
        </div>
        <div>
          <Label className="text-[10px]">Link to Project (optional)</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="text-xs h-9"><SelectValue placeholder="— none —" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Button size="sm" onClick={testConnection} disabled={testing}>
          {testing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <PlugZap className="h-3 w-3 mr-1" />}
          Test Connection
        </Button>
        {fields && isEmpty && (
          <Button size="sm" variant="secondary" onClick={() => deploySchema(false)} disabled={deploying}>
            {deploying ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Rocket className="h-3 w-3 mr-1" />}
            Deploy Microplanning schema
          </Button>
        )}
        {fields && !isEmpty && (
          <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-3 w-3 mr-1" /> Preview Mapping
          </Button>
        )}
        {fields && (
          <Button size="sm" onClick={saveConfig} disabled={saving || testOk !== true}>
            {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Save & Enable Webhook
          </Button>
        )}
        {testOk === true && (
          <Badge className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>
        )}
        {testOk === false && (
          <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>
        )}
      </div>

      {/* Test result diagnostics */}
      {testSteps && (
        <div className="border rounded p-2 space-y-1 bg-muted/30">
          <div className="text-[11px] font-semibold">Connection Test Report</div>
          <ul className="text-xs space-y-0.5">
            {testSteps.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5">
                {s.ok
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                <span className="capitalize font-medium">{s.step}:</span>
                <span className={s.ok ? "text-muted-foreground" : "text-destructive"}>{s.detail ?? (s.ok ? "OK" : "failed")}</span>
              </li>
            ))}
          </ul>
          {submissionCount > 0 && (
            <div className="text-[11px] text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> This form already has {submissionCount} submission(s).
            </div>
          )}
        </div>
      )}

      {/* Mapping UI */}
      {fields && !isEmpty && (
        <div className="border rounded p-2 space-y-1">
          <div className="text-[11px] font-semibold">
            Map Microplanning fields → Kobo questions
            {formTitle && <span className="text-muted-foreground font-normal"> · {formTitle}</span>}
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground text-left">
                <tr>
                  <th className="py-1 pr-2 w-1/2">Microplan field</th>
                  <th className="py-1">Kobo question</th>
                </tr>
              </thead>
              <tbody>
                {TARGET_FIELDS.map((t) => (
                  <tr key={t.key} className="border-t">
                    <td className="py-1 pr-2">{t.label} <span className="text-muted-foreground font-mono text-[10px]">({t.key})</span></td>
                    <td className="py-1">
                      <Select
                        value={mapping[t.key] ?? "__none__"}
                        onValueChange={(v) => setMapping((m) => {
                          const next = { ...m };
                          if (v === "__none__") delete next[t.key]; else next[t.key] = v;
                          return next;
                        })}
                      >
                        <SelectTrigger className="text-xs h-8"><SelectValue placeholder="— unmapped —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— unmapped —</SelectItem>
                          {fields.map((f) => (
                            <SelectItem key={f.name} value={f.name}>
                              {f.label} <span className="text-muted-foreground font-mono">({f.name})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {fields && isEmpty && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
          This Kobo form has no fields yet. Click <b>Deploy Microplanning schema</b> to push the entire
          Geo-enabled Microplanning question set into Kobo automatically. Field mapping will then be 1:1.
        </div>
      )}

      {/* Side-by-side preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" /> Mapping Preview
              {formTitle && <span className="text-xs text-muted-foreground font-normal">· {formTitle}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto text-xs">
            <table className="w-full">
              <thead className="bg-muted text-left sticky top-0">
                <tr>
                  <th className="p-2 w-1/3">Microplanning column</th>
                  <th className="p-2 w-1/3">Kobo question (label · name)</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {TARGET_FIELDS.map((t) => {
                  const src = mapping[t.key];
                  const field = fields?.find((f) => f.name === src);
                  const status = !src
                    ? { label: "Unmapped", cls: "text-amber-600", icon: <AlertTriangle className="h-3 w-3" /> }
                    : !field
                    ? { label: "Missing from Kobo", cls: "text-destructive", icon: <XCircle className="h-3 w-3" /> }
                    : { label: "Mapped", cls: "text-emerald-600", icon: <CheckCircle2 className="h-3 w-3" /> };
                  return (
                    <tr key={t.key} className="border-t">
                      <td className="p-2">
                        <div className="font-medium">{t.label}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{t.key}</div>
                      </td>
                      <td className="p-2">
                        {field ? (
                          <>
                            <div className="font-medium">{field.label}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{field.name} · {field.type}</div>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2">
                        <span className={`inline-flex items-center gap-1 ${status.cls}`}>
                          {status.icon}{status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-muted-foreground border-t pt-2">
            Only fields marked <b>Mapped</b> will be transferred by the webhook. Save the configuration to
            enable ingestion for this form.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
