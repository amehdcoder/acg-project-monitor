import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageSquareText, Send, XCircle, MinusCircle, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; projectId: string }
interface LogRow { id: string; kind: string; phone: string | null; status: string; error: string | null; created_at: string }

const KIND_LABEL: Record<string, string> = {
  reminder_2d: "2 days before", reminder_1d: "1 day before", reminder_day: "Day of visit", overdue: "Missed visit",
};

const empty = {
  gateway_url: "https://api.sms-gate.app/3rdparty/v1", username: "", password: "", project_label: "HANDS",
  message_upcoming: "", message_overdue: "", enabled: true,
};

const SmsRemindersDialog = ({ open, onOpenChange, projectId }: Props) => {
  const { toast } = useToast();
  const [form, setForm] = useState(empty);
  const [hasPw, setHasPw] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "run" | "load">("");
  const [logs, setLogs] = useState<LogRow[]>([]);

  const call = (body: Record<string, unknown>) =>
    supabase.functions.invoke("send-sms-reminders", { body: { project_id: projectId, ...body } });

  const loadLogs = useCallback(async () => {
    const { data } = await supabase.from("sms_notification_log")
      .select("id, kind, phone, status, error, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50);
    setLogs((data || []) as LogRow[]);
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setBusy("load");
    void call({ action: "get_settings" }).then(({ data }) => {
      const s = data?.settings, d = data?.defaults || {};
      setForm({ ...empty, ...d, ...(s || {}), password: "" });
      setHasPw(!!s?.has_password);
      setBusy("");
    });
    void loadLogs();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy("save");
    const { data, error } = await call({ action: "save_settings", settings: form });
    setBusy("");
    if (error || data?.error) { toast({ title: "Could not save", description: data?.error || error?.message, variant: "destructive" }); return; }
    if (form.password) setHasPw(true);
    setForm((f) => ({ ...f, password: "" }));
    toast({ title: "SMS settings saved" });
  };

  const run = async () => {
    setBusy("run");
    const { data, error } = await call({ action: "run" });
    setBusy("");
    if (error || data?.error) { toast({ title: "Send failed", description: data?.error || error?.message, variant: "destructive" }); return; }
    toast({ title: "Reminders processed", description: `${data.sent} sent · ${data.failed} failed · ${data.skipped} skipped (no phone)` });
    void loadLogs();
  };

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const len = (s: string) => s.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="form-scroll max-h-[92dvh] max-w-2xl overflow-y-auto p-0">
        <div className="bg-gradient-to-r from-health-teal to-primary px-6 py-5 text-primary-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary-foreground"><MessageSquareText className="h-5 w-5" /> SMS follow-up reminders</DialogTitle>
          </DialogHeader>
          <p className="mt-1 text-sm opacity-90">Sent from your own Android phone every morning at 8:00 (Lagos): 2 days before, 1 day before, on the day, and once if a visit is missed. Works on any phone — no smartphone or data needed for beneficiaries.</p>
        </div>

        <div className="space-y-6 p-6">
          <section className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
            <h3 className="flex items-center gap-2 font-semibold text-health-ink"><Smartphone className="h-4 w-4" /> Set up the sending phone (free)</h3>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>On an Android phone with a SIM that has an SMS bundle, install <span className="font-medium text-foreground">SMS Gateway for Android</span> (free, from Google Play or sms-gate.app).</li>
              <li>Open it, switch on <span className="font-medium text-foreground">Cloud server</span>, then tap <span className="font-medium text-foreground">Online</span>.</li>
              <li>Copy the <span className="font-medium text-foreground">Username</span> and <span className="font-medium text-foreground">Password</span> it shows into the boxes below.</li>
              <li>Keep the phone charged and connected to the internet. Turn off battery optimisation for the app.</li>
            </ol>
          </section>

          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Username</Label><Input value={form.username} onChange={set("username")} autoComplete="off" /></div>
              <div className="space-y-1.5"><Label>Password</Label><Input type="password" autoComplete="off" value={form.password} onChange={set("password")} placeholder={hasPw ? "Saved — leave blank to keep" : "From the app"} /></div>
              <div className="space-y-1.5"><Label>Sign-off name in messages</Label><Input value={form.project_label} onChange={set("project_label")} placeholder="HANDS" /></div>
              <label className="flex items-center gap-3 self-end rounded-lg border border-border px-3 py-2.5">
                <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
                <span className="text-sm font-medium">Automatic sending on</span>
              </label>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Advanced: own server address</summary>
              <div className="mt-2 space-y-1.5"><Label>Gateway address</Label><Input value={form.gateway_url} onChange={set("gateway_url")} /></div>
            </details>
            <div className="space-y-1.5">
              <Label>Upcoming visit message</Label>
              <Textarea rows={3} value={form.message_upcoming} onChange={set("message_upcoming")} />
              <p className="text-xs text-muted-foreground">{len(form.message_upcoming)} characters · under 160 is one SMS (names fill in later)</p>
            </div>
            <div className="space-y-1.5">
              <Label>Missed visit message</Label>
              <Textarea rows={3} value={form.message_overdue} onChange={set("message_overdue")} />
              <p className="text-xs text-muted-foreground">Fill-ins: {"{name}"} first name, {"{facility}"}, {"{date}"}, {"{project}"}</p>
            </div>
            <Button onClick={save} disabled={!!busy} className="w-full sm:w-auto">{busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save settings</Button>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-health-ink">Recent messages</h3>
              <Button onClick={run} disabled={!!busy} variant="outline" className="gap-2">
                {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send due reminders now
              </Button>
            </div>
            <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
              {logs.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">No SMS reminders sent yet.</li>}
              {logs.map((l) => {
                const Icon = l.status === "sent" ? CheckCircle2 : l.status === "failed" ? XCircle : MinusCircle;
                return (
                  <li key={l.id} className="flex gap-3 px-3 py-2.5">
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", l.status === "sent" ? "text-status-success" : l.status === "failed" ? "text-destructive" : "text-muted-foreground")} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium text-health-ink">{KIND_LABEL[l.kind] || l.kind} · <span className="font-mono text-xs">{l.phone ? `+${l.phone}` : "no phone"}</span></p>
                      <p className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()} · {l.status}</p>
                      {l.error && <p className="break-words text-xs text-destructive">{l.error}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SmsRemindersDialog;
