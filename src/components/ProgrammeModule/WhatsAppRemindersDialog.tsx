import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, Send, XCircle, MinusCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; projectId: string }

interface LogRow { id: string; kind: string; phone: string | null; status: string; error: string | null; created_at: string }

const KIND_LABEL: Record<string, string> = {
  reminder_2d: "2 days before", reminder_1d: "1 day before", reminder_day: "Day of visit", overdue: "Overdue",
};

const UPCOMING_COPY = "Dear {{1}}, warm greetings from the Accelerate Project team. This is a gentle reminder that your scheduled follow-up visit at {{2}} is coming up on {{3}}. Your health, case progress, and well-being are vital to your journey. Please make sure to attend. If you face any challenges, kindly contact your case officer. Thank you!";
const OVERDUE_COPY = "Dear {{1}}, we noticed you missed your scheduled follow-up visit at {{2}} originally set for {{3}}. Your continued progress matters deeply to us. Please visit the facility as soon as possible, or reach out to your case officer if you need support or need to reschedule. We are here to help you succeed!";

const empty = {
  access_token: "", phone_number_id: "", business_account_id: "",
  template_upcoming: "follow_up_upcoming", template_overdue: "follow_up_overdue", template_language: "en", enabled: true,
};

const WhatsAppRemindersDialog = ({ open, onOpenChange, projectId }: Props) => {
  const { toast } = useToast();
  const [form, setForm] = useState(empty);
  const [tokenHint, setTokenHint] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "run" | "load">("");
  const [logs, setLogs] = useState<LogRow[]>([]);

  const call = (body: Record<string, unknown>) =>
    supabase.functions.invoke("send-whatsapp-reminders", { body: { project_id: projectId, ...body } });

  const loadLogs = useCallback(async () => {
    const { data } = await (supabase as unknown as { from: (t: string) => any }).from("whatsapp_notification_log")
      .select("id, kind, phone, status, error, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50);
    setLogs((data || []) as LogRow[]);
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setBusy("load");
    void call({ action: "get_settings" }).then(({ data }) => {
      const s = data?.settings;
      if (s) {
        setForm({ ...empty, ...s, access_token: "" });
        setTokenHint(s.token_hint || "");
      }
      setBusy("");
    });
    void loadLogs();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy("save");
    const { data, error } = await call({ action: "save_settings", settings: form });
    setBusy("");
    if (error || data?.error) { toast({ title: "Could not save", description: data?.error || error?.message, variant: "destructive" }); return; }
    if (form.access_token) setTokenHint(`••••${form.access_token.slice(-4)}`);
    setForm((f) => ({ ...f, access_token: "" }));
    toast({ title: "WhatsApp settings saved" });
  };

  const run = async () => {
    setBusy("run");
    const { data, error } = await call({ action: "run" });
    setBusy("");
    if (error || data?.error) { toast({ title: "Send failed", description: data?.error || error?.message, variant: "destructive" }); return; }
    toast({ title: "Reminders processed", description: `${data.sent} sent · ${data.failed} failed · ${data.skipped} skipped (no phone)` });
    void loadLogs();
  };

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="form-scroll max-h-[92dvh] max-w-2xl overflow-y-auto p-0">
        <div className="bg-gradient-to-r from-status-success to-health-teal px-6 py-5 text-primary-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary-foreground"><MessageCircle className="h-5 w-5" /> WhatsApp follow-up reminders</DialogTitle>
          </DialogHeader>
          <p className="mt-1 text-sm opacity-90">Sent automatically every morning at 8:00 (Lagos): 2 days before, 1 day before, on the day, and once if a visit is missed.</p>
        </div>

        <div className="space-y-6 p-6">
          <section className="space-y-3">
            <h3 className="font-semibold text-health-ink">Meta WhatsApp Cloud API</h3>
            <div className="space-y-1.5">
              <Label>Permanent access token</Label>
              <Input type="password" autoComplete="off" value={form.access_token} onChange={set("access_token")} placeholder={tokenHint ? `Saved (${tokenHint}) — leave blank to keep` : "Paste the permanent token"} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Phone Number ID</Label><Input value={form.phone_number_id} onChange={set("phone_number_id")} /></div>
              <div className="space-y-1.5"><Label>WhatsApp Business Account ID</Label><Input value={form.business_account_id} onChange={set("business_account_id")} /></div>
              <div className="space-y-1.5"><Label>Upcoming template name</Label><Input value={form.template_upcoming} onChange={set("template_upcoming")} /></div>
              <div className="space-y-1.5"><Label>Overdue template name</Label><Input value={form.template_overdue} onChange={set("template_overdue")} /></div>
              <div className="space-y-1.5"><Label>Template language code</Label><Input value={form.template_language} onChange={set("template_language")} placeholder="en" /></div>
              <label className="flex items-center gap-3 self-end rounded-lg border border-border px-3 py-2.5">
                <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
                <span className="text-sm font-medium">Automatic sending on</span>
              </label>
            </div>
            <Button onClick={save} disabled={!!busy} className="w-full sm:w-auto">{busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save settings</Button>
          </section>

          <section className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
            <h3 className="font-semibold text-health-ink">Template wording to submit to Meta</h3>
            <p className="text-xs text-muted-foreground">Create both templates in WhatsApp Manager (category Utility) with exactly this text. {"{{1}}"} = name, {"{{2}}"} = facility, {"{{3}}"} = visit date.</p>
            <p><span className="font-semibold">Upcoming:</span> {UPCOMING_COPY}</p>
            <p><span className="font-semibold">Overdue:</span> {OVERDUE_COPY}</p>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-health-ink">Recent notifications</h3>
              <Button onClick={run} disabled={!!busy} variant="outline" className="gap-2">
                {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Test send reminders
              </Button>
            </div>
            <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
              {logs.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">No reminders sent yet.</li>}
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

export default WhatsAppRemindersDialog;
