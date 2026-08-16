/**
 * Generic KoboToolbox ↔ Amehnities sync / integration settings dialog.
 *
 * Every checklist in the app (current and future) can mount this via
 * `<KoboSyncButton formType="..." formTitle="..." />`. It shows the REST
 * service endpoint for the checklist, the shared secret (admins only), an
 * optional XLSForm download and the most recent sync events written by the
 * `kobo-webhook` edge function.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CheckCircle2, Copy, Download, Eye, EyeOff, History, Link2, Loader2, RefreshCw, ShieldCheck, Webhook, XCircle,
} from "lucide-react";

export interface KoboIntegrationDialogProps {
  open: boolean;
  onClose: () => void;
  /** Webhook router key, e.g. "seeclear", "mda_checklist", or a form id. */
  formType: string;
  /** Human readable checklist name shown in the dialog. */
  formTitle: string;
  /** Optional extra sentence describing the checklist. */
  description?: string;
  /** Only admins may reveal the shared secret. */
  canViewSecret?: boolean;
  /** Optional XLSForm builder — renders the download card when provided. */
  onDownloadXlsForm?: () => void;
}

interface EventRow {
  id: string;
  status: string;
  kobo_uuid: string | null;
  entry_id: string | null;
  message: string | null;
  created_at: string;
}

const projectRef = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID as string | undefined;

const copy = async (text: string, label: string) => {
  try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
  catch { toast.error("Copy failed"); }
};

export default function KoboIntegrationDialog({
  open, onClose, formType, formTitle, description, canViewSecret = false, onDownloadXlsForm,
}: KoboIntegrationDialogProps) {
  const [secret, setSecret] = useState<string | null>(null);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);

  const webhookUrl = useMemo(
    () => `https://${projectRef ?? "<project-ref>"}.supabase.co/functions/v1/kobo-webhook?form_type=${encodeURIComponent(formType)}`,
    [formType],
  );

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("kobo_sync_events")
      .select("id,status,kobo_uuid,entry_id,message,created_at")
      .ilike("status", `%${formType}%`)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) toast.error("Could not load sync log");
    setEvents((data as EventRow[]) ?? []);
    setLoading(false);
  }, [formType]);

  const loadSecret = useCallback(async () => {
    if (!canViewSecret) return;
    setLoadingSecret(true); setSecretError(null);
    const { data, error } = await supabase
      .from("kobo_webhook_secrets")
      .select("secret")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) setSecretError("You do not have permission to view the shared secret.");
    else if (!data?.length) setSecretError("No active webhook secret configured yet.");
    else setSecret(String((data[0] as { secret: string }).secret));
    setLoadingSecret(false);
  }, [canViewSecret]);

  useEffect(() => {
    if (!open) { setShowSecret(false); return; }
    void loadEvents();
    void loadSecret();
  }, [open, loadEvents, loadSecret]);

  const ok = events.filter((e) => !/error|fail/i.test(e.status)).length;
  const failed = events.length - ok;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" /> KoboToolbox ↔ Amehnities sync settings
          </DialogTitle>
          <DialogDescription>
            Real-time integration for the {formTitle}.{" "}
            {description ?? "Every Kobo submission is posted to Amehnities and mapped into the linked dashboard instantly."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* endpoint */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> REST service endpoint</p>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => copy(webhookUrl, "Webhook URL")}><Copy className="h-4 w-4" /></Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              In Kobo: <strong>Project → Settings → REST Services → Register a New Service</strong>. Paste this URL and
              select <em>JSON</em>. Optionally append <code>&amp;project_id=&lt;uuid&gt;</code> to tag submissions to a project.
            </p>
          </div>

          {/* secret */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" /> Shared secret header</p>
            <p className="text-[11px] text-muted-foreground">
              Add a custom HTTP header <code>x-kobo-secret</code> with the active secret so only your Kobo project can post data.
            </p>
            {canViewSecret ? (
              <div className="flex gap-2">
                <Input readOnly className="font-mono text-xs"
                  value={loadingSecret ? "Loading…" : secretError ?? (showSecret ? secret ?? "" : "•".repeat(32))} />
                <Button size="sm" variant="outline" disabled={!secret} onClick={() => setShowSecret((s) => !s)}>
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="outline" disabled={!secret} onClick={() => secret && copy(secret, "Secret")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Badge variant="outline" className="text-[11px]">Visible to administrators only</Badge>
            )}
          </div>

          {/* xlsform */}
          {onDownloadXlsForm && (
            <div className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Checklist XLSForm</p>
                <p className="text-[11px] text-muted-foreground">
                  Download the Kobo-ready XLSForm that matches this checklist schema exactly.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={onDownloadXlsForm}>
                <Download className="h-4 w-4 mr-1" /> Download XLSForm
              </Button>
            </div>
          )}

          {/* log */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Recent sync events</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px]">{ok} synced</Badge>
                {failed > 0 && <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive text-[10px]">{failed} failed</Badge>}
                <Button size="sm" variant="ghost" onClick={loadEvents} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {events.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No submissions received from KoboToolbox yet.
              </p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {events.map((e) => {
                  const bad = /error|fail/i.test(e.status);
                  return (
                    <div key={e.id} className="flex items-center gap-2 rounded border px-2 py-1.5 text-[11px]">
                      {bad ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      <span className="font-medium">{e.status}</span>
                      <span className="truncate text-muted-foreground">{e.kobo_uuid ?? e.entry_id ?? e.message ?? ""}</span>
                      <span className="ml-auto shrink-0 text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
