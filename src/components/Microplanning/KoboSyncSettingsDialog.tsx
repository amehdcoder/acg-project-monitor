// KoboToolbox Sync Settings panel — Super Admin only.
//
// Shows the public webhook URL, a masked secret (with Copy),
// an XLSForm template download, and a recent sync log.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Cloud, Copy, Download, Eye, EyeOff, History, Link2, Loader2, RefreshCw, RotateCw, ShieldCheck, Upload, Webhook, XCircle } from "lucide-react";
import {
  buildMicroplanningXlsForm,
  downloadWorkbookBlob,
  sha256Hex,
  workbookToBase64,
  type BuildProgress,
} from "@/lib/microplanning/xlsformBuilder";
import { validateMicroplanningXlsForm, type ValidationReport } from "@/lib/microplanning/xlsformValidator";
import KoboFormConfigPanel from "./KoboFormConfigPanel";
import XlsFormVersionsDialog from "./XlsFormVersionsDialog";
import type * as XLSX from "xlsx";

interface Props {
  open: boolean;
  onClose: () => void;
  projectName?: string | null;
  projectStates?: string[] | null;
}

interface EventRow {
  id: string;
  kobo_uuid: string | null;
  submitted_by_kobo: string | null;
  submitted_at: string | null;
  status: string;
  error: string | null;
  matched_entry_id: string | null;
  payload: any;
  created_at: string;
}

const WEBHOOK_SECRET_HINT = "•".repeat(32);

const projectRef = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID as string | undefined;
const webhookUrl = projectRef
  ? `https://${projectRef}.supabase.co/functions/v1/kobo-microplan-webhook`
  : "https://<project-ref>.supabase.co/functions/v1/kobo-microplan-webhook";

const copy = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  } catch {
    toast({ title: "Copy failed", variant: "destructive" });
  }
};

// XLSForm builder moved to `@/lib/microplanning/xlsformBuilder` — it emits a
// full-fidelity XLSForm mirroring MicroplanEntryForm.tsx (cascaded GRID3
// choices with GPS coordinates, "Other" manual entry, skip logic, distance
// calculations and validations).


const KoboSyncSettingsDialog = ({ open, onClose }: Props) => {
  const [showSecret, setShowSecret] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [buildingXls, setBuildingXls] = useState(false);
  const [xlsProgress, setXlsProgress] = useState<BuildProgress | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [changelog, setChangelog] = useState("");
  const [savedVersionId, setSavedVersionId] = useState<string | null>(null);
  const [savedVersionNumber, setSavedVersionNumber] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<null | { form_uid: string | null; version_id: string | null; status: string; form_title: string | null }>(null);
  const [koboServer, setKoboServer] = useState("https://kf.kobotoolbox.org");
  const [koboToken, setKoboToken] = useState("");
  const [koboFormUid, setKoboFormUid] = useState("");
  const [versionsOpen, setVersionsOpen] = useState(false);

  const resetPipeline = () => {
    setWorkbook(null);
    setReport(null);
    setSavedVersionId(null);
    setSavedVersionNumber(null);
    setUploadResult(null);
  };

  const handleBuildAndValidate = async () => {
    setBuildingXls(true);
    setXlsProgress({ phase: "states", done: 0, total: 1 });
    resetPipeline();
    try {
      const wb = await buildMicroplanningXlsForm((p) => setXlsProgress(p));
      const r = validateMicroplanningXlsForm(wb);
      setWorkbook(wb);
      setReport(r);
      if (r.ok) {
        toast({ title: "XLSForm built & validated", description: `${r.stats.questions} questions · ${r.stats.choiceLists} choice lists · ${r.warnings.length} warning(s).` });
      } else {
        toast({ title: "Validation failed", description: `${r.errors.length} error(s) — fix before uploading to Kobo.`, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "XLSForm build failed", description: e?.message ?? "Unexpected error", variant: "destructive" });
    } finally {
      setBuildingXls(false);
      setXlsProgress(null);
    }
  };

  const handleDownloadCurrent = () => {
    if (!workbook) return;
    const name = `amehnities_geo_microplanning_${new Date().toISOString().slice(0, 10)}.xlsx`;
    downloadWorkbookBlob(workbook, name);
  };

  const handleSaveVersion = async (setActive: boolean) => {
    if (!workbook || !report) return;
    setSaving(true);
    try {
      const { base64, bytes, size } = workbookToBase64(workbook);
      const hash = await sha256Hex(bytes);
      const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
        body: {
          action: "save_xlsform_version",
          xlsx_base64: base64,
          changelog: changelog.trim() || `Auto-saved on ${new Date().toLocaleString()}`,
          size_bytes: size,
          sha256: hash,
          survey_row_count: report.stats.surveyRows,
          choices_row_count: report.stats.choicesRows,
          validation_report: report,
          set_active: setActive,
        },
      });
      if (error) throw error;
      const v = data?.version;
      setSavedVersionId(v?.id ?? null);
      setSavedVersionNumber(v?.version_number ?? null);
      toast({ title: `Saved as Version ${v?.version_number}`, description: setActive ? "Marked as the active XLSForm." : "Saved to history." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleUploadToKobo = async () => {
    if (!workbook || !report || !report.ok) return;
    if (!koboToken.trim()) {
      toast({ title: "Kobo API token required", variant: "destructive" });
      return;
    }
    setUploading(true);
    setUploadResult(null);
    try {
      const { base64 } = workbookToBase64(workbook);
      const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
        body: {
          action: "upload_xlsform_to_kobo",
          server_url: koboServer.trim() || "https://kf.kobotoolbox.org",
          api_token: koboToken.trim(),
          xlsx_base64: base64,
          form_uid: koboFormUid.trim() || undefined,
          asset_name: `Amehnities Microplanning ${new Date().toISOString().slice(0, 10)}.xlsx`,
          version_id: savedVersionId ?? undefined,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || data?.error || `Kobo import status: ${data?.status}`);
      setUploadResult({
        form_uid: data.form_uid ?? null,
        version_id: data.version_id ?? null,
        status: data.status,
        form_title: data.form_title ?? null,
      });
      toast({
        title: "Uploaded to KoboToolbox",
        description: `Form ${data.form_title ?? data.form_uid} · version ${data.version_id ?? "—"}`,
      });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("kobo_webhook_events" as any)
        .select("id, kobo_uuid, submitted_by_kobo, submitted_at, status, error, matched_entry_id, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setEvents((data ?? []) as unknown as EventRow[]);
    } catch (e: any) {
      toast({ title: "Failed to load log", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchSecret = async () => {
    setLoadingSecret(true);
    setSecretError(null);
    try {
      const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
        body: { action: "get_webhook_secret" },
      });
      if (error) throw error;
      if (!data?.secret) throw new Error(data?.error ?? "Secret unavailable");
      setSecret(data.secret as string);
    } catch (e: any) {
      setSecretError(e.message ?? "Failed to load secret");
    } finally {
      setLoadingSecret(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadEvents();
      if (!secret) fetchSecret();
    }
  }, [open]);

  const copySecret = async () => {
    if (!secret) {
      toast({ title: "Secret not loaded yet", variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(secret);
      toast({ title: "Webhook Secret copied to clipboard!" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const resetSecret = async () => {
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
        body: { action: "reset_webhook_secret" },
      });
      if (error) throw error;
      if (!data?.secret) throw new Error(data?.error ?? "Rotation failed");
      setSecret(data.secret as string);
      setShowSecret(true);
      setSecretError(null);
      setConfirmingReset(false);
      toast({
        title: "New Webhook Secret generated",
        description: "The previous key is now invalid. Copy and paste this into KoboToolbox.",
      });
    } catch (e: any) {
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };


  const statusBadge = (s: string) =>
    s === "success"
      ? <Badge className="bg-emerald-600 hover:bg-emerald-700">Success</Badge>
      : <Badge variant="destructive">Failed</Badge>;

  const stateOf = (r: EventRow) =>
    (r.payload?.state as string) ?? "—";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            KoboToolbox Sync Settings
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Webhook Authorization Credentials — prominent */}
          <div className="border-2 border-primary/40 rounded-lg p-4 space-y-3 bg-primary/5">
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <Webhook className="h-5 w-5" /> Webhook Authorization Credentials
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">
                Webhook Secret Key (<code className="px-1 bg-muted rounded text-[10px]">x-kobo-secret</code>)
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  readOnly
                  type={showSecret ? "text" : "password"}
                  value={
                    loadingSecret
                      ? "Loading secret key..."
                      : secretError
                        ? `⚠ ${secretError}`
                        : (secret ?? WEBHOOK_SECRET_HINT)
                  }
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSecret((s) => !s)}
                  disabled={loadingSecret || !secret}
                  title={showSecret ? "Hide" : "Show"}
                >
                  {loadingSecret ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : showSecret ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={copySecret}
                  disabled={loadingSecret || !secret}
                  className="whitespace-nowrap"
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Secret Key
                </Button>
              </div>
              {secretError && (
                <div className="flex items-center justify-between text-[11px] text-destructive">
                  <span>{secretError}</span>
                  <Button size="sm" variant="ghost" onClick={fetchSecret}>Retry</Button>
                </div>
              )}

              {/* Rotate / Reset */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-primary/20 mt-1">
                <div className="text-[11px] text-muted-foreground">
                  Suspect the key leaked? Rotate it — the old value stops working immediately.
                </div>
                {confirmingReset ? (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setConfirmingReset(false)} disabled={resetting}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="destructive" onClick={resetSecret} disabled={resetting}>
                      {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RotateCw className="h-3.5 w-3.5 mr-1.5" />}
                      Confirm reset
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setConfirmingReset(true)} disabled={loadingSecret}>
                    <RotateCw className="h-3.5 w-3.5 mr-1.5" /> Reset Secret
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-md border bg-background/60 p-2.5 text-[11px] space-y-1.5">
              <div className="font-semibold text-foreground">Where to paste this in KoboToolbox (kf.kobotoolbox.org):</div>
              <div>
                <b>Option 1 · Custom HTTP Header</b> — Set <b>Header Name</b> to{" "}
                <code className="px-1 bg-muted rounded">x-kobo-secret</code> and{" "}
                <b>Header Value</b> to your copied secret key.
              </div>
              <div>
                <b>Option 2 · Basic Authorization</b> — Set <b>Username</b> to{" "}
                <code className="px-1 bg-muted rounded">kobo</code> and{" "}
                <b>Password</b> to your copied secret key.
              </div>
            </div>
          </div>

          {/* Webhook URL */}
          <div className="border rounded-lg p-3 space-y-2 bg-card">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Link2 className="h-4 w-4 text-primary" /> Webhook URL
            </div>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => copy(webhookUrl, "Webhook URL")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              In KoboToolbox → Project → Settings → REST Services, paste this URL into <b>Endpoint URL</b>,
              set <b>Type = JSON</b>, tick <b>Enabled</b>, and authenticate using either option shown above.
            </p>
          </div>

          {/* Form Configurations & Mapping */}
          <KoboFormConfigPanel />


          {/* Complete XLSForm — build → validate → download / save / upload workflow */}
          <div className="border rounded-lg p-3 space-y-3 bg-card">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Download className="h-4 w-4 text-primary" /> Complete XLSForm — Build, Validate & Publish
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setVersionsOpen(true)}>
                  <History className="h-3.5 w-3.5 mr-1.5" /> Versions
                </Button>
                <Button size="sm" variant="default" onClick={handleBuildAndValidate} disabled={buildingXls}>
                  {buildingXls ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Building…</>
                  ) : (
                    <><ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Build & Validate</>
                  )}
                </Button>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Mirrors every field, skip logic and GRID3 cascade (State → LGA → Ward → FLHF → Community → Settlement)
              with pre-loaded GPS, override capture and “Other (specify manually)”. Validation runs the Kobo-compatible
              rule checker (types, name uniqueness, choice-list references, group balance) before you upload.
            </p>

            {buildingXls && xlsProgress && (
              <div className="text-[10px] text-primary font-medium">
                {xlsProgress.phase === "states" && `Preparing admin cascade… ${xlsProgress.done}/${xlsProgress.total} states`}
                {xlsProgress.phase === "flhfs" && `Packing GRID3 FLHFs… ${xlsProgress.done}/${xlsProgress.total} states`}
                {xlsProgress.phase === "communities" && `Packing GRID3 Communities & Settlements… ${xlsProgress.done}/${xlsProgress.total} states`}
                {xlsProgress.phase === "assemble" && "Assembling workbook…"}
                {xlsProgress.phase === "done" && "Finalising…"}
              </div>
            )}

            {report && (
              <div className={`rounded-md border p-2.5 space-y-1.5 text-[11px] ${report.ok ? "border-emerald-500/50 bg-emerald-500/5" : "border-destructive/50 bg-destructive/5"}`}>
                <div className="flex items-center gap-2 font-semibold">
                  {report.ok
                    ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Passed Kobo-compatibility checks</>
                    : <><XCircle className="h-3.5 w-3.5 text-destructive" /> {report.errors.length} error(s) — fix before uploading</>}
                </div>
                <div className="text-muted-foreground">
                  {report.stats.questions} questions · {report.stats.groups} groups · {report.stats.choiceLists} choice lists ·
                  form_id <code className="px-1 bg-muted rounded">{report.stats.formId ?? "—"}</code> · v{report.stats.version ?? "—"}
                </div>
                {report.errors.slice(0, 5).map((e, i) => (
                  <div key={`e${i}`} className="text-destructive flex items-start gap-1.5"><XCircle className="h-3 w-3 mt-0.5 shrink-0" /><span>{e.message}</span></div>
                ))}
                {report.warnings.slice(0, 3).map((w, i) => (
                  <div key={`w${i}`} className="text-amber-700 flex items-start gap-1.5"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /><span>{w.message}</span></div>
                ))}
                {(report.errors.length > 5 || report.warnings.length > 3) && (
                  <div className="text-muted-foreground italic">…and {(report.errors.length - Math.min(5, report.errors.length)) + (report.warnings.length - Math.min(3, report.warnings.length))} more.</div>
                )}
              </div>
            )}

            {workbook && report && (
              <div className="space-y-2 border-t pt-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button size="sm" variant="outline" onClick={handleDownloadCurrent}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Download .xlsx
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => handleSaveVersion(false)} disabled={saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <History className="h-3.5 w-3.5 mr-1.5" />}
                    Save version
                  </Button>
                  <Button size="sm" onClick={() => handleSaveVersion(true)} disabled={saving || !report.ok}>
                    Save & set active
                  </Button>
                  {savedVersionNumber != null && (
                    <Badge variant="outline" className="text-emerald-700 border-emerald-500">Saved v{savedVersionNumber}</Badge>
                  )}
                </div>
                <Textarea
                  value={changelog}
                  onChange={(e) => setChangelog(e.target.value)}
                  placeholder="Changelog / notes for this version (e.g. “Added Trachoma disaggregation, fixed FLHF distance calc”)"
                  className="text-xs min-h-[60px]"
                />

                <div className="rounded-md border bg-background/60 p-2.5 space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <Cloud className="h-3.5 w-3.5 text-primary" /> One-click upload to KoboToolbox
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Input value={koboServer} onChange={(e) => setKoboServer(e.target.value)} placeholder="Server URL" className="text-xs font-mono" />
                    <Input value={koboToken} onChange={(e) => setKoboToken(e.target.value)} placeholder="Kobo API token" type="password" className="text-xs font-mono" />
                    <Input value={koboFormUid} onChange={(e) => setKoboFormUid(e.target.value)} placeholder="Existing form uid (optional — overwrites)" className="text-xs font-mono" />
                  </div>
                  <Button size="sm" onClick={handleUploadToKobo} disabled={uploading || !report.ok || !koboToken.trim()}>
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                    Upload & deploy
                  </Button>
                  {uploadResult && (
                    <div className="text-[11px] rounded border border-emerald-500/50 bg-emerald-500/10 p-2">
                      <div className="font-semibold text-emerald-700 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Accepted by KoboToolbox — status {uploadResult.status}
                      </div>
                      <div className="mt-1 space-y-0.5">
                        <div><b>Form:</b> {uploadResult.form_title ?? "—"}</div>
                        <div><b>form_id (uid):</b> <code className="px-1 bg-muted rounded">{uploadResult.form_uid ?? "—"}</code></div>
                        <div><b>version_id:</b> <code className="px-1 bg-muted rounded">{uploadResult.version_id ?? "—"}</code></div>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Leave <i>form uid</i> blank to create a new asset. Provide it to import into an existing form
                    (⚠ overwrites its questions). Token from KoboToolbox → Account Settings → API.
                  </p>
                </div>
              </div>
            )}
          </div>


          {/* Sync log */}
          <div className="border rounded-lg p-3 space-y-2 bg-card">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">Recent Sync Log ({events.length})</div>
              <Button size="sm" variant="ghost" onClick={loadEvents} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground text-left">
                  <tr>
                    <th className="py-1 pr-2">When</th>
                    <th className="py-1 pr-2">User</th>
                    <th className="py-1 pr-2">State</th>
                    <th className="py-1 pr-2">Status</th>
                    <th className="py-1">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No submissions yet.</td></tr>
                  ) : events.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-1 pr-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-1 pr-2">{r.submitted_by_kobo ?? "—"}</td>
                      <td className="py-1 pr-2">{stateOf(r)}</td>
                      <td className="py-1 pr-2">{statusBadge(r.status)}</td>
                      <td className="py-1 text-muted-foreground truncate max-w-[220px]">{r.error ?? (r.matched_entry_id ? `Entry ${r.matched_entry_id.slice(0, 8)}…` : "OK")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
      <XlsFormVersionsDialog open={versionsOpen} onClose={() => setVersionsOpen(false)} />
    </Dialog>
  );
};

export default KoboSyncSettingsDialog;
