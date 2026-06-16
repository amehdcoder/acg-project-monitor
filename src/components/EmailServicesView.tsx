import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Send, Loader2, MessageSquareText, ShieldCheck, Info, Sparkles } from "lucide-react";
import brandLogo from "@/assets/logo-amehnities.png";
import AdhocProjectChatView from "@/components/AdhocProjectChatView";

const PROVIDERS = [
  {
    id: "gmail",
    name: "Gmail",
    color: "from-[#ea4335] to-[#fbbc05]",
    smtp: "smtp.gmail.com : 587 (TLS) / 465 (SSL)",
    imap: "imap.gmail.com : 993",
    note: "Create an App Password (Google Account → Security → 2-Step Verification → App passwords). Use it instead of your normal password.",
    link: "https://myaccount.google.com/apppasswords",
  },
  {
    id: "outlook",
    name: "Outlook / Microsoft 365",
    color: "from-[#0072c6] to-[#28a8ea]",
    smtp: "smtp.office365.com : 587 (STARTTLS)",
    imap: "outlook.office365.com : 993",
    note: "Enable SMTP AUTH in the Microsoft 365 admin centre and create an App Password if 2FA is on.",
    link: "https://account.microsoft.com/security",
  },
  {
    id: "yahoo",
    name: "Yahoo Mail",
    color: "from-[#6001d2] to-[#a020f0]",
    smtp: "smtp.mail.yahoo.com : 587 / 465",
    imap: "imap.mail.yahoo.com : 993",
    note: "Generate an App Password (Yahoo Account Security → Generate app password). Required for third-party clients.",
    link: "https://login.yahoo.com/account/security",
  },
] as const;

const ORG_TEMPLATE = (body: string) => `
<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0f766e,#115e59);padding:20px 24px;color:#fff">
    <h2 style="margin:0;font-size:18px">Amehnities</h2>
    <p style="margin:4px 0 0;font-size:12px;opacity:.85">Public Health Monitoring Platform</p>
  </div>
  <div style="padding:24px;color:#111827;font-size:14px;line-height:1.6">${body.replace(/\n/g, "<br/>")}</div>
  <div style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:11px;border-top:1px solid #e5e7eb">
    Sent via Amehnities · info@amehnities.org · www.amehnities.org
  </div>
</div>`;

export default function EmailServicesView() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [branded, setBranded] = useState(true);
  const [sending, setSending] = useState(false);

  const send = async () => {
    const recipients = to.split(",").map((s) => s.trim()).filter(Boolean);
    if (recipients.length === 0) return toast.error("Add at least one recipient");
    if (!subject.trim()) return toast.error("Subject is required");
    if (!message.trim()) return toast.error("Message body is required");
    setSending(true);
    try {
      const html = branded ? ORG_TEMPLATE(message) : `<div>${message.replace(/\n/g, "<br/>")}</div>`;
      const { data, error } = await supabase.functions.invoke("send-email-smtp", {
        body: { to: recipients, subject, html, text: message },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Email sent to ${recipients.length} recipient(s)`);
      setTo(""); setSubject(""); setMessage("");
    } catch (e) {
      toast.error(`Failed to send: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      {/* Branded header */}
      <div className="rounded-2xl bg-gradient-to-r from-primary/90 to-primary/60 p-5 text-primary-foreground flex items-center gap-4 shadow-sm">
        <img src={brandLogo} alt="Amehnities" className="h-12 w-12 rounded-lg bg-white/90 p-1 object-contain" />
        <div>
          <h1 className="text-xl font-display font-semibold">Email Services Hub</h1>
          <p className="text-sm opacity-90">
            Send professional, branded emails and connect Gmail, Yahoo &amp; Outlook — alongside your project chat.
          </p>
        </div>
      </div>

      <Tabs defaultValue="compose" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="compose"><Send className="h-4 w-4 mr-1.5" />Compose &amp; Send</TabsTrigger>
          <TabsTrigger value="connect"><Mail className="h-4 w-4 mr-1.5" />Connect Providers</TabsTrigger>
          <TabsTrigger value="chat"><MessageSquareText className="h-4 w-4 mr-1.5" />Project Chat</TabsTrigger>
        </TabsList>

        {/* COMPOSE */}
        <TabsContent value="compose" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />Compose email
              </CardTitle>
              <CardDescription>
                Delivered securely from <span className="font-medium">info@amehnities.org</span> with organizational branding.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Recipients</Label>
                <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, second@example.com" />
                <p className="text-xs text-muted-foreground">Separate multiple addresses with commas.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Message</Label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} placeholder="Write your message..." />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={branded} onChange={(e) => setBranded(e.target.checked)} className="accent-primary" />
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" />Apply Amehnities branded template</span>
              </label>
              <Button onClick={send} disabled={sending} className="w-full sm:w-auto">
                {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                {sending ? "Sending..." : "Send email"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONNECT */}
        <TabsContent value="connect" className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm flex items-start gap-2">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-muted-foreground">
              Use these settings to connect your Gmail, Yahoo or Outlook mailbox in any IMAP/SMTP client.
              Always use an <span className="font-medium text-foreground">App Password</span> — never your main password.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {PROVIDERS.map((p) => (
              <Card key={p.id} className="overflow-hidden">
                <div className={`h-1.5 bg-gradient-to-r ${p.color}`} />
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">SMTP (outgoing)</span>
                    <p className="font-mono text-foreground">{p.smtp}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IMAP (incoming)</span>
                    <p className="font-mono text-foreground">{p.imap}</p>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{p.note}</p>
                  <Button asChild variant="outline" size="sm" className="w-full mt-1">
                    <a href={p.link} target="_blank" rel="noopener noreferrer">Open security settings</a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* CHAT */}
        <TabsContent value="chat">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-primary" />Project Chat
              </CardTitle>
              <CardDescription>Collaborate with your team in context while you manage emails.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <AdhocProjectChatView />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
