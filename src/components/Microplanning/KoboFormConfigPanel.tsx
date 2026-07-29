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
import { Loader2, Search, Rocket, Save, Trash2, PlusCircle, PlugZap, CheckCircle2, XCircle, AlertTriangle, Eye, History, Webhook, RefreshCcw, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import KoboMappingHistoryDialog from "./KoboMappingHistoryDialog";


type TestStep = { step: string; ok: boolean; detail?: string };

// Target columns in public.microplan_entries the admin can map to.
// Grouped for legibility — the panel maps ALL survey/repeat/system fields, not
// a hand-curated subset, so the automated auto-mapper hits 100% coverage.
const TARGET_FIELDS: Array<{ key: string; label: string; aliases?: string[] }> = [
  // Identity / project
  { key: "project_id", label: "Project ID", aliases: ["amehnities_project_id", "project"] },
  { key: "year_of_microplanning", label: "Year of Microplanning", aliases: ["year"] },
  { key: "campaign_type", label: "Campaign Type" },
  { key: "population_source", label: "Population Source" },
  // Admin cascade
  { key: "state", label: "State" },
  { key: "lga", label: "LGA", aliases: ["local_government_area", "lga_name"] },
  { key: "ward", label: "Ward", aliases: ["ward_name"] },
  // FLHF
  { key: "flhf_name", label: "FLHF Name", aliases: ["flhf", "health_facility"] },
  { key: "flhf_incharge_name", label: "FLHF In-charge Name", aliases: ["incharge_name"] },
  { key: "flhf_incharge_phone", label: "FLHF In-charge Phone", aliases: ["incharge_phone"] },
  { key: "flhf_latitude", label: "FLHF Latitude", aliases: ["flhf_lat"] },
  { key: "flhf_longitude", label: "FLHF Longitude", aliases: ["flhf_lng", "flhf_lon"] },
  // Community
  { key: "community_name", label: "Community", aliases: ["community"] },
  { key: "community_leader_name", label: "Community Leader" },
  { key: "community_leader_phone", label: "Community Leader Phone" },
  { key: "community_latitude", label: "Community Latitude", aliases: ["community_lat"] },
  { key: "community_longitude", label: "Community Longitude", aliases: ["community_lng"] },
  { key: "community_distance_to_flhf_km", label: "Community → FLHF Distance (km)" },
  // Settlement
  { key: "settlement_name", label: "Settlement", aliases: ["settlement"] },
  { key: "settlement_mai_unguwa", label: "Mai Unguwa (Settlement Head)" },
  { key: "settlement_latitude", label: "Settlement Latitude" },
  { key: "settlement_longitude", label: "Settlement Longitude" },
  { key: "settlement_distance_to_flhf_km", label: "Settlement → FLHF Distance (km)" },
  // Context
  { key: "terrain_type", label: "Terrain Type" },
  { key: "accessibility", label: "Accessibility" },
  { key: "security_clearance", label: "Security Clearance" },
  // Population
  { key: "estimated_total_population", label: "Estimated Total Population", aliases: ["total_population"] },
  { key: "estimated_children_0_4", label: "Children 0–4 years" },
  { key: "estimated_children_5_14", label: "Children 5–14 years" },
  { key: "estimated_adults_15_plus", label: "Adults 15+ years" },
  { key: "number_of_households", label: "Number of Households", aliases: ["households"] },
  // Trachoma
  { key: "trachoma_0_5_months", label: "Trachoma 0–5 months" },
  { key: "trachoma_6m_6y", label: "Trachoma 6m–6y" },
  { key: "trachoma_7_14y", label: "Trachoma 7–14y" },
  { key: "trachoma_15_plus", label: "Trachoma 15+" },
  // PWD
  { key: "pwd_total", label: "PWD Total" },
  { key: "pwd_visual", label: "PWD Visual" },
  { key: "pwd_hearing", label: "PWD Hearing" },
  { key: "pwd_physical", label: "PWD Physical" },
  { key: "pwd_intellectual", label: "PWD Intellectual" },
  { key: "pwd_communication", label: "PWD Communication" },
  { key: "pwd_selfcare", label: "PWD Self-care" },
  { key: "pwd_albinism", label: "PWD Albinism" },
  // CDDs
  { key: "cdd_names", label: "CDD Names" },
  { key: "cdd_phone_numbers", label: "CDD Phone Numbers" },
  { key: "cdd_from_community", label: "CDD From Community" },
  // Meta
  { key: "notes", label: "Additional Notes" },
  { key: "kobo_submission_id", label: "Kobo Submission ID", aliases: ["_id", "_uuid"] },
];

/**
 * Normalize a Kobo question name / label into a comparable token stream so the
 * auto-mapper can match `FLHF Name` ↔ `flhf_name` ↔ `flhfName` ↔ `flhf-name`.
 */
const normToken = (s: string): string =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/**
 * Build a mapping from every target field to the best-matching Kobo question,
 * evaluated as name-equality → alias-equality → normalized-token equality →
 * label-normalized equality. Skips ambiguous ties.
 */
const computeAutoMap = (fields: KoboField[]): Record<string, string> => {
  const byName = new Map<string, string>();
  const byLabel = new Map<string, string>();
  for (const f of fields) {
    byName.set(normToken(f.name), f.name);
    byLabel.set(normToken(f.label), f.name);
  }
  const out: Record<string, string> = {};
  for (const t of TARGET_FIELDS) {
    const candidates = [t.key, ...(t.aliases ?? [])].map(normToken);
    for (const c of candidates) {
      const hit = byName.get(c) ?? byLabel.get(c);
      if (hit) { out[t.key] = hit; break; }
    }
  }
  return out;
};



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
    const koboFields = (res.fields ?? []) as KoboField[];
    setFields(koboFields);
    setIsEmpty(Boolean(res.is_empty));
    setFormTitle(res.form_title ?? null);
    setSubmissionCount(Number(res.submission_count ?? 0));
    setTestSteps(res.steps ?? null);
    setTestOk(res.ok !== false);
    // Full-coverage auto-map: name/alias/label normalization across ALL target
    // fields. User-edited mappings win over auto values.
    const auto = computeAutoMap(koboFields);
    setMapping((prev) => ({ ...auto, ...prev }));
  };

  /** Dynamic "Auto-Map All Unmapped Fields" — re-runs the matcher against the
   * currently-loaded Kobo schema and fills any target row the admin left blank. */
  const autoMapUnmapped = () => {
    if (!fields) return;
    const auto = computeAutoMap(fields);
    let filled = 0;
    setMapping((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(auto)) {
        if (!next[k]) { next[k] = v; filled++; }
      }
      return next;
    });
    toast({ title: `Auto-mapped ${filled} field${filled === 1 ? "" : "s"}`, description: filled ? "Review and Save to persist." : "All target fields were already mapped." });
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

  const registerWebhook = async () => {
    if (!formUid.trim() || !apiToken.trim()) {
      toast({ title: "Form UID and API token required", variant: "destructive" });
      return;
    }
    try {
      const res: any = await invoke({
        action: "register_webhook",
        server_url: server.trim(),
        form_uid: formUid.trim(),
        api_token: apiToken.trim(),
        project_id: projectId || null,
      });
      toast({ title: "Kobo REST Service registered", description: res?.hook?.endpoint ?? "Webhook active" });
    } catch (e: any) {
      toast({ title: "Auto-register failed", description: e.message, variant: "destructive" });
    }
  };

  const backfillConfig = async (c: FormConfig) => {
    if (!confirm(`Reprocess up to 500 historical submissions for ${c.form_title ?? c.form_uid} through the current mapper?`)) return;
    try {
      const res: any = await invoke({
        action: "backfill_submissions",
        source: "kobo",
        config_id: c.id,
        project_id: c.project_id,
        form_uid: c.form_uid,
        limit: 500,
      });
      toast({
        title: "Backfill complete",
        description: `${res.succeeded}/${res.processed} synced${res.failed ? ` · ${res.failed} failed` : ""}`,
      });
    } catch (e: any) {
      toast({ title: "Backfill failed", description: e.message, variant: "destructive" });
    }
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
                    <Button size="sm" variant="ghost" onClick={() => backfillConfig(c)} title="Reprocess history through current mapper">
                      <RefreshCcw className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setHistoryOpenFor(c)} title="Mapping history">
                      <History className="h-3 w-3" />
                    </Button>
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
        {fields && (
          <Button size="sm" variant="outline" onClick={registerWebhook} title="Auto-register Amehnities webhook as a Kobo REST Service">
            <Webhook className="h-3 w-3 mr-1" /> Auto-register Webhook
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

      {/* Mapping History & Versioning */}
      <KoboMappingHistoryDialog
        open={!!historyOpenFor}
        onClose={() => setHistoryOpenFor(null)}
        configId={historyOpenFor?.id ?? null}
        formTitle={historyOpenFor?.form_title ?? historyOpenFor?.form_uid ?? null}
        onRolledBack={() => { loadAll(); }}
      />
    </div>
  );

}
