/**
 * Configurable alert thresholds + dashboard / email notifications panel for
 * the Medicine Accountability dashboard.
 *
 * Thresholds are persisted locally per user; breaches are evaluated live
 * against the currently filtered dataset and can be emailed to a supervision
 * distribution list as an HTML digest.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertTriangle, BellRing, CheckCircle2, Mail, Send, Settings2, ShieldAlert, X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  alertsToHtml, saveThresholds, type AlertThresholds, type DrillKey, type MedicineAlert,
} from "@/lib/isc/medicineDrilldown";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function PctField({ label, value, onChange, hint }: { label: string; value: number; onChange: (n: number) => void; hint: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium">{label}</Label>
      <div className="flex items-center gap-1">
        <Input type="number" min={0} max={100} step={0.5} className="h-8 text-xs"
          value={Number((value * 100).toFixed(2))}
          onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)} />
        <span className="text-[11px] text-muted-foreground">%</span>
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

function NumField({ label, value, onChange, hint, step = 0.05 }: { label: string; value: number; onChange: (n: number) => void; hint: string; step?: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium">{label}</Label>
      <Input type="number" min={0} step={step} className="h-8 text-xs"
        value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
      <p className="text-[10px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

interface Props {
  alerts: MedicineAlert[];
  thresholds: AlertThresholds;
  onThresholds: (t: AlertThresholds) => void;
  scope: string;
  onDrill: (k: DrillKey) => void;
}

export default function MedicineAlertsPanel({ alerts, thresholds, onThresholds, scope, onDrill }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AlertThresholds>(thresholds);
  const [emailDraft, setEmailDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const visible = useMemo(() => alerts.filter((a) => !dismissed.includes(a.id)), [alerts, dismissed]);
  const critical = visible.filter((a) => a.severity === "critical");

  const openSettings = () => { setDraft(thresholds); setOpen(true); };

  const commit = () => {
    saveThresholds(draft);
    onThresholds(draft);
    setOpen(false);
    toast({ title: "Alert thresholds saved", description: "Breaches are re-evaluated against the current filters." });
  };

  const addEmail = () => {
    const v = emailDraft.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) { toast({ title: "Invalid email address", variant: "destructive" }); return; }
    if (draft.notifyEmails.includes(v)) { setEmailDraft(""); return; }
    setDraft({ ...draft, notifyEmails: [...draft.notifyEmails, v] });
    setEmailDraft("");
  };

  const sendDigest = async () => {
    if (!thresholds.notifyEmails.length) {
      toast({ title: "No recipients configured", description: "Add at least one email address in alert settings.", variant: "destructive" });
      return;
    }
    if (!visible.length) {
      toast({ title: "Nothing to send", description: "No active breaches for the current filters." });
      return;
    }
    setSending(true);
    const html = alertsToHtml(visible, scope);
    let ok = 0;
    for (const to of thresholds.notifyEmails) {
      try {
        const { error } = await supabase.functions.invoke("send-email-smtp", {
          body: {
            to,
            subject: `[Amehnities] ${critical.length ? `${critical.length} critical` : `${visible.length}`} medicine accountability alert${visible.length === 1 ? "" : "s"}`,
            html,
          },
        });
        if (!error) ok++;
      } catch { /* handled below */ }
    }
    setSending(false);
    toast({
      title: ok ? `Digest sent to ${ok} recipient${ok === 1 ? "" : "s"}` : "Digest could not be sent",
      description: ok ? `${visible.length} alerts included.` : "Email sending is restricted to administrators.",
      variant: ok ? undefined : "destructive",
    });
  };

  return (
    <Card className={critical.length ? "border-destructive/40" : visible.length ? "border-amber-300" : "border-emerald-300"}>
      <CardHeader className="py-3 px-4 border-b bg-muted/40 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BellRing className={`h-4 w-4 ${critical.length ? "text-destructive" : visible.length ? "text-amber-600" : "text-emerald-600"}`} />
          Supply integrity alerts
          {critical.length > 0 && <Badge variant="destructive" className="text-[10px]">{critical.length} critical</Badge>}
          {visible.length - critical.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{visible.length - critical.length} warning</Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={sendDigest}
            disabled={sending || !visible.length}>
            <Send className="h-3.5 w-3.5 mr-1" /> Email digest
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={openSettings}>
            <Settings2 className="h-3.5 w-3.5 mr-1" /> Thresholds
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {visible.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            Every configured threshold is satisfied for {scope.toLowerCase()} — no transit shrinkage, expiry or buffer breach detected.
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((a) => (
              <div key={a.id}
                className={`rounded-lg border p-3 ${a.severity === "critical" ? "border-destructive/40 bg-destructive/5" : "border-amber-300 bg-amber-50"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.severity === "critical"
                        ? <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
                        : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
                      <span className="text-xs font-semibold">{a.title}</span>
                      <Badge variant="outline" className="text-[10px]">{a.scope}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground break-words">{a.detail}</p>
                    <p className="mt-1 text-[11px] font-medium text-foreground/80">Action: {a.action}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="font-display text-lg font-bold leading-none">{a.value}</p>
                      <p className="text-[10px] text-muted-foreground">threshold {a.threshold}</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onDrill(a.kpi)}>
                      Investigate
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => setDismissed((d) => [...d, a.id])} aria-label="Dismiss alert">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {dismissed.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setDismissed([])}>
                Restore {dismissed.length} dismissed alert{dismissed.length === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Alert thresholds & notifications</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Thresholds drive both the on-dashboard alert feed and the email digest. Warning triggers an amber alert;
              critical triggers a red alert and is highlighted in the digest subject line.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <section className="rounded-lg border p-3">
              <h4 className="text-xs font-semibold mb-2">Transit shrinkage</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <PctField label="Warning at" value={draft.shrinkageWarn} onChange={(v) => setDraft({ ...draft, shrinkageWarn: v })}
                  hint="Typical programme tolerance for handling and recording variance is 2%." />
                <PctField label="Critical at" value={draft.shrinkageCrit} onChange={(v) => setDraft({ ...draft, shrinkageCrit: v })}
                  hint="Above this, treat as possible diversion and trigger physical verification." />
              </div>
            </section>

            <section className="rounded-lg border p-3">
              <h4 className="text-xs font-semibold mb-2">Expiry risk index</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <PctField label="Warning at" value={draft.expiryWarn} onChange={(v) => setDraft({ ...draft, expiryWarn: v })}
                  hint="Share of stock on hand inside the expiry horizon that warrants an FEFO plan." />
                <PctField label="Critical at" value={draft.expiryCrit} onChange={(v) => setDraft({ ...draft, expiryCrit: v })}
                  hint="Above this, material write-off is likely within the quarter." />
              </div>
            </section>

            <section className="rounded-lg border p-3">
              <h4 className="text-xs font-semibold mb-2">Buffer retention</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <PctField label="Thin buffer below" value={draft.bufferMin} onChange={(v) => setDraft({ ...draft, bufferMin: v })}
                  hint="Retained share below this leaves no contingency for resupply." />
                <PctField label="Under-deployed above" value={draft.bufferMax} onChange={(v) => setDraft({ ...draft, bufferMax: v })}
                  hint="Retained share above this means medicines are still in stores when CDDs should be mobilised." />
              </div>
            </section>

            <section className="rounded-lg border p-3">
              <h4 className="text-xs font-semibold mb-2">Facility equity index (CV)</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumField label="Warning at CV" value={draft.equityWarn} onChange={(v) => setDraft({ ...draft, equityWarn: v })}
                  hint="Coefficient of variation above 0.25 indicates a moderate spread across facilities." />
                <NumField label="Critical at CV" value={draft.equityCrit} onChange={(v) => setDraft({ ...draft, equityCrit: v })}
                  hint="Above 0.50 the LGA distribution is inequitable and should be rebalanced." />
              </div>
            </section>

            <section className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email notifications</h4>
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-muted-foreground">Enabled</Label>
                  <Switch checked={draft.emailEnabled} onCheckedChange={(v) => setDraft({ ...draft, emailEnabled: v })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Input value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
                  placeholder="supervisor@example.org" className="h-8 text-xs" />
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addEmail}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {draft.notifyEmails.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No recipients yet — digests can still be reviewed on the dashboard.</p>
                )}
                {draft.notifyEmails.map((e) => (
                  <Badge key={e} variant="secondary" className="text-[10px] gap-1">
                    {e}
                    <button onClick={() => setDraft({ ...draft, notifyEmails: draft.notifyEmails.filter((x) => x !== e) })}
                      aria-label={`Remove ${e}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Digests are sent from the platform mailbox and are restricted to administrator accounts.
              </p>
            </section>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={commit}>Save thresholds</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
