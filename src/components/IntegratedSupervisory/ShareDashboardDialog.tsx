/**
 * Granular publish/share modal — writes into the existing dashboard_shares table.
 * Access levels: PUBLIC_LINK, AUTHENTICATED, PROJECT_MEMBER, RESTRICTED.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Copy, Globe, Lock, Users, ShieldCheck, X, Loader2 } from "lucide-react";

export type AccessLevel = "PUBLIC_LINK" | "AUTHENTICATED" | "PROJECT_MEMBER" | "RESTRICTED";

interface Props {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  dashboardLabel?: string;
}

const genToken = () => (crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function ShareDashboardDialog({ open, onClose, dashboardId, dashboardLabel }: Props) {
  const [level, setLevel] = useState<AccessLevel>("AUTHENTICATED");
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [realtime, setRealtime] = useState(true);
  const [token, setToken] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("dashboard_shares")
        .select("token, access_type, allowed_emails, label")
        .eq("dashboard_id", dashboardId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setToken(data.token || "");
        setLevel((data.access_type as AccessLevel) || "AUTHENTICATED");
        setEmails(Array.isArray(data.allowed_emails) ? data.allowed_emails : []);
      } else {
        setToken(genToken());
      }
    })();
  }, [open, dashboardId]);

  const shareUrl = `${window.location.origin}/shared-dashboard/${token}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast.success("Share link copied"); }
    catch { toast.error("Copy failed — select and copy manually"); }
  };

  const addEmail = () => {
    const e = emailInput.trim().toLowerCase();
    if (!e || !e.includes("@") || emails.includes(e)) { setEmailInput(""); return; }
    setEmails((prev) => [...prev, e]); setEmailInput("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("dashboard_shares").upsert({
        dashboard_id: dashboardId,
        token,
        access_type: level,
        allowed_emails: level === "RESTRICTED" ? emails : [],
        label: dashboardLabel ?? "Kobo Supervisory Dashboard",
        is_active: true,
        created_by: userData?.user?.id,
      }, { onConflict: "token" });
      if (error) throw error;
      toast.success("Share settings saved");
      onClose();
    } catch (e: any) {
      toast.error("Could not save share settings", { description: e?.message });
    } finally { setSaving(false); }
  };

  const options: { level: AccessLevel; icon: JSX.Element; title: string; desc: string }[] = [
    { level: "PUBLIC_LINK",   icon: <Globe className="h-4 w-4 text-sky-500" />,        title: "Anyone with the link",   desc: "No sign-in required — view in real time." },
    { level: "AUTHENTICATED", icon: <Lock className="h-4 w-4 text-emerald-500" />,      title: "Authenticated users",    desc: "Anyone signed in to Amehnities can view." },
    { level: "PROJECT_MEMBER",icon: <Users className="h-4 w-4 text-violet-500" />,      title: "Project members only",   desc: "Restricted to members of the active project." },
    { level: "RESTRICTED",    icon: <ShieldCheck className="h-4 w-4 text-amber-500" />, title: "Specific people",        desc: "Only the emails you list can view." },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share dashboard</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600">Share link</label>
            <div className="flex items-center gap-2 mt-1">
              <Input readOnly value={shareUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copy}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 mb-2 block">Who can view</label>
            <RadioGroup value={level} onValueChange={(v) => setLevel(v as AccessLevel)} className="space-y-2">
              {options.map((o) => (
                <label key={o.level} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${level === o.level ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  <RadioGroupItem value={o.level} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">{o.icon} {o.title}</div>
                    <div className="text-xs text-slate-500">{o.desc}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          {level === "RESTRICTED" && (
            <div>
              <label className="text-xs font-semibold text-slate-600">Allowed emails</label>
              <div className="flex gap-2 mt-1">
                <Input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())} placeholder="user@example.org" />
                <Button variant="outline" onClick={addEmail}>Add</Button>
              </div>
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {emails.map((e) => (
                    <Badge key={e} variant="secondary" className="pl-2 pr-1 gap-1">{e}
                      <button className="hover:text-rose-500" onClick={() => setEmails(emails.filter((x) => x !== e))}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
            <div>
              <div className="text-sm font-semibold text-slate-800">Real-time sync</div>
              <div className="text-xs text-slate-500">Viewers see new Kobo submissions as they arrive.</div>
            </div>
            <Switch checked={realtime} onCheckedChange={setRealtime} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Save & publish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
