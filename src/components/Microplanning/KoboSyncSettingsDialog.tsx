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
import { toast } from "@/hooks/use-toast";
import { Copy, Download, Eye, EyeOff, Link2, Loader2, RefreshCw, RotateCw, Webhook } from "lucide-react";
import * as XLSX from "xlsx";
import KoboFormConfigPanel from "./KoboFormConfigPanel";

interface Props {
  open: boolean;
  onClose: () => void;
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

const downloadXlsFormTemplate = () => {
  const survey = [
    ["type", "name", "label", "required", "appearance", "choice_filter"],
    ["start", "start", "", "", "", ""],
    ["end", "end", "", "", "", ""],
    ["today", "today", "", "", "", ""],
    ["deviceid", "deviceid", "", "", "", ""],
    ["text", "project_id", "Amehnities Project ID", "yes", "", ""],
    ["select_one states", "state", "State", "yes", "", ""],
    ["select_one lgas", "lga", "LGA", "yes", "", "state=${state}"],
    ["select_one wards", "ward", "Ward", "yes", "", "lga=${lga}"],
    ["select_one flhfs_or_other", "flhf_name", "FLHF", "yes", "", "ward=${ward}"],
    ["text", "flhf_custom", "Other FLHF (specify)", "", "", "${flhf_name} = 'other'"],
    ["select_one communities_or_other", "community", "Community", "yes", "", "flhf=${flhf_name}"],
    ["text", "community_custom", "Other Community (specify)", "", "", "${community} = 'other'"],
    ["select_one settlements_or_other", "settlement", "Settlement", "", "", "community=${community}"],
    ["text", "settlement_custom", "Other Settlement (specify)", "", "", "${settlement} = 'other'"],
    ["geopoint", "community_gps", "Community GPS", "yes", "", ""],
    ["note", "hint", "Ensure all cascading choices load before submission.", "", "", ""],
  ];
  const choices = [
    ["list_name", "name", "label"],
    ["flhfs_or_other", "other", "Other (specify manually)"],
    ["communities_or_other", "other", "Other (specify manually)"],
    ["settlements_or_other", "other", "Other (specify manually)"],
  ];
  const settings = [
    ["form_title", "form_id", "version"],
    ["Amehnities Microplanning (Kobo)", "amehnities_microplanning", new Date().toISOString().slice(0, 10).replace(/-/g, "")],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(survey), "survey");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(choices), "choices");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(settings), "settings");
  XLSX.writeFile(wb, "microplanning_xlsform.xlsx");
};

const KoboSyncSettingsDialog = ({ open, onClose }: Props) => {
  const [showSecret, setShowSecret] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);

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


          {/* XLSForm template */}
          <div className="border rounded-lg p-3 space-y-2 bg-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Download className="h-4 w-4 text-primary" /> XLSForm Hierarchy Template
              </div>
              <Button size="sm" variant="outline" onClick={downloadXlsFormTemplate}>
                <Download className="h-3.5 w-3.5 mr-1" /> Download template
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Pre-configured with cascading State → LGA → Ward → FLHF → Community choices and <code>or_other</code>-style
              manual entry for FLHFs, Communities, and Settlements.
            </p>
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
    </Dialog>
  );
};

export default KoboSyncSettingsDialog;
