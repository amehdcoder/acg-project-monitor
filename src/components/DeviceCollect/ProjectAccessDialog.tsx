import { useCallback, useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, QrCode, RefreshCw, Copy, ShieldOff, Smartphone } from "lucide-react";
import { toast } from "sonner";

interface AccessConfig {
  enabled: boolean;
  join_code: string;
  allow_forms: boolean;
  allow_cases: boolean;
  allow_seeclear?: boolean;
  expires_at: string | null;
  pin_hash: string | null;
}

interface DeviceRow {
  id: string;
  device_id: string;
  label: string;
  revoked: boolean;
  records_sent: number;
  last_seen_at: string | null;
  enrolled_at: string;
}

interface Props {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Owner/admin panel: turn on account-free collection and manage joined devices. */
const ProjectAccessDialog = ({ projectId, projectName, open, onOpenChange }: Props) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AccessConfig | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [allowForms, setAllowForms] = useState(true);
  const [allowCases, setAllowCases] = useState(false);
  const [allowSeeclear, setAllowSeeclear] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [pin, setPin] = useState("");

  const call = useCallback(
    async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("project-access-admin", {
        body: { projectId, ...payload },
      });
      if (error) {
        // The server explains exactly why a save was refused; read it out of the
        // failed response instead of showing a blank "could not save".
        let detail = "";
        try {
          const body = await (error as any)?.context?.json?.();
          detail = body?.detail || body?.error || "";
        } catch {
          /* no readable body — fall back to the generic message */
        }
        throw new Error(detail || (error as Error).message || "request_failed");
      }
      if ((data as any)?.error) throw new Error((data as any).detail || (data as any).error);
      return data as any;
    },
    [projectId],
  );

  /** Mirror the stored settings onto the switches, so what is shown is what is saved. */
  const applyConfig = useCallback((cfg: AccessConfig | null) => {
    setConfig(cfg);
    setEnabled(!!cfg?.enabled);
    setAllowForms(cfg ? !!(cfg as any).allow_forms : true);
    setAllowCases(!!(cfg as any)?.allow_cases);
    setAllowSeeclear(!!(cfg as any)?.allow_seeclear);
    setExpiresAt(cfg?.expires_at ? String(cfg.expires_at).slice(0, 10) : "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call({ action: "get" });
      applyConfig(data.config ?? null);
      setDevices(data.devices ?? []);
    } catch {
      toast.error("Could not load the access settings for this project.");
    } finally {
      setLoading(false);
    }
  }, [call, applyConfig]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const save = async (extra: Record<string, unknown> = {}) => {
    setSaving(true);
    try {
      const data = await call({
        action: "save",
        enabled,
        allowForms,
        allowCases,
        allowSeeclear,
        expiresAt: expiresAt || null,
        pin: pin.trim() ? pin.trim() : undefined,
        ...extra,
      });
      setPin("");
      // Re-read from the server and confirm the stored settings really match
      // what was asked for, so a silent partial save can never look successful.
      const fresh = await call({ action: "get" });
      const stored = (fresh.config ?? data.config ?? null) as AccessConfig | null;
      applyConfig(stored);
      setDevices(fresh.devices ?? []);

      if (!stored || !!stored.enabled !== enabled) {
        toast.error("The access settings did not save. Please try again.");
      } else if (data.warning) {
        toast.warning(String(data.warning));
      } else {
        toast.success(extra.rotateCode ? "New project code generated" : "Access settings saved");
      }
    } catch (err) {
      const reason = String((err as Error)?.message || "");
      toast.error("Could not save the access settings.", {
        description: reason && reason !== "request_failed" ? reason : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const joinUrl = config?.join_code
    ? `${window.location.origin}/join?code=${encodeURIComponent(config.join_code)}`
    : "";

  const revokeDevice = async (deviceRowId: string, revoked: boolean) => {
    try {
      await call({ action: "revoke_device", deviceRowId, revoked });
      await load();
    } catch {
      toast.error("Could not update that device.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" /> Collect without accounts
          </DialogTitle>
          <DialogDescription>
            Let collectors join {projectName} by scanning a QR code or typing a project code — no
            username or password. Existing signed-in users are unaffected.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Enable account-free collection</Label>
                <p className="text-xs text-muted-foreground">Devices join with a code and work fully offline.</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm">Allow Forms</Label>
              <Switch checked={allowForms} onCheckedChange={setAllowForms} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Allow Cases</Label>
              <Switch checked={allowCases} onCheckedChange={setAllowCases} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">See Clear facility checklist</Label>
                <p className="text-xs text-muted-foreground">Collectors fill the eye-health visit checklist offline.</p>
              </div>
              <Switch checked={allowSeeclear} onCheckedChange={setAllowSeeclear} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pin" className="text-sm">PIN (optional)</Label>
                <Input id="pin" value={pin} onChange={(e) => setPin(e.target.value)}
                  placeholder={config?.pin_hash ? "PIN set — type to change" : "No PIN"} inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp" className="text-sm">Code expires</Label>
                <Input id="exp" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>

            <Button className="w-full" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save settings
            </Button>

            {config?.join_code && enabled && (
              <>
                <Separator />
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-xl bg-white p-3">
                    <QRCodeCanvas value={joinUrl} size={168} includeMargin={false} />
                  </div>
                  <p className="font-mono text-2xl tracking-[0.3em]">{config.join_code}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      navigator.clipboard.writeText(joinUrl);
                      toast.success("Join link copied");
                    }}>
                      <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void save({ rotateCode: true })} disabled={saving}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> New code
                    </Button>
                  </div>
                  <p className="text-[11px] text-center text-muted-foreground">
                    Generating a new code signs out every device that joined with the old one.
                  </p>
                </div>
              </>
            )}

            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4" /> Joined devices ({devices.length})
                </Label>
                {devices.length > 0 && (
                  <Button size="sm" variant="ghost" className="text-destructive"
                    onClick={async () => { await call({ action: "revoke_all" }); await load(); }}>
                    <ShieldOff className="mr-1.5 h-3.5 w-3.5" /> Revoke all
                  </Button>
                )}
              </div>
              {devices.length === 0 && (
                <p className="text-xs text-muted-foreground">No devices have joined yet.</p>
              )}
              {devices.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border p-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{d.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.records_sent} record(s) sent
                      {d.last_seen_at ? ` · last seen ${new Date(d.last_seen_at).toLocaleString()}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.revoked && <Badge variant="outline">Revoked</Badge>}
                    <Button size="sm" variant={d.revoked ? "outline" : "ghost"}
                      className={d.revoked ? "" : "text-destructive"}
                      onClick={() => void revokeDevice(d.id, !d.revoked)}>
                      {d.revoked ? "Restore" : "Revoke"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ProjectAccessDialog;
