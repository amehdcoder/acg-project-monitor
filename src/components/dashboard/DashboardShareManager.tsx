import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Plus, Trash2, Copy, Check, Globe, Mail, Users, Link2, Power, PowerOff, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DashboardShare, ShareAccessType, createShare, deleteShare, listShares, shareUrl, updateShare,
} from "@/lib/dashboardShare";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dashboardId: string;
  dashboardName: string;
  projectId?: string | null;
  form?: { id: string; name: string; snapshot?: unknown } | null;
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "co_owner", label: "Co-owner" },
  { value: "super_admin", label: "Super Admin" },
  { value: "systems_admin", label: "Systems Admin" },
  { value: "user", label: "Standard User" },
];

const ACCESS_META: Record<ShareAccessType, { icon: any; title: string; blurb: string }> = {
  public: { icon: Globe, title: "Public", blurb: "Anyone with the link can view (read-only)." },
  external_emails: { icon: Mail, title: "Specific External Emails", blurb: "Only listed emails, verified by a one-time code." },
  internal_roles: { icon: Users, title: "Internal App Roles", blurb: "Signed-in users with an allowed role." },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DashboardShareManager({
  open, onOpenChange, dashboardId, dashboardName, projectId, form,
}: Props) {
  const [shares, setShares] = useState<DashboardShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New-share form state
  const [accessType, setAccessType] = useState<ShareAccessType>("public");
  const [label, setLabel] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>(["super_admin", "systems_admin"]);
  const [expiresAt, setExpiresAt] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setShares(await listShares(dashboardId, projectId));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load share links");
    } finally {
      setLoading(false);
    }
  }, [dashboardId, projectId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    setLabel(dashboardName);
  }, [open, dashboardName]);

  const addEmail = () => {
    const e = emailInput.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) { toast.error("Enter a valid email address"); return; }
    if (emails.includes(e)) { setEmailInput(""); return; }
    setEmails((p) => [...p, e]);
    setEmailInput("");
  };

  const toggleRole = (r: string) =>
    setRoles((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));

  const handleCreate = async () => {
    if (accessType === "external_emails" && emails.length === 0) {
      toast.error("Add at least one external email"); return;
    }
    if (accessType === "internal_roles" && roles.length === 0) {
      toast.error("Select at least one role"); return;
    }
    setSaving(true);
    try {
      await createShare({
        dashboard_id: dashboardId,
        project_id: projectId ?? null,
        access_type: accessType,
        allowed_emails: accessType === "external_emails" ? emails : [],
        allowed_roles: accessType === "internal_roles" ? roles : [],
        label: label.trim() || dashboardName,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        form_id: form?.id ?? null,
        form_name: form?.name ?? null,
        form_snapshot: form?.snapshot ?? null,
      });
      toast.success("Share link created");
      setEmails([]); setEmailInput(""); setExpiresAt("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create share link");
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (s: DashboardShare) => {
    try {
      await navigator.clipboard.writeText(shareUrl(s.token));
      setCopiedId(s.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const toggleActive = async (s: DashboardShare) => {
    try {
      await updateShare(s.id, { is_active: !s.is_active });
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  };

  const remove = async (s: DashboardShare) => {
    try {
      await deleteShare(s.id);
      toast.success("Share link deleted");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  };

  const AccessIcon = ACCESS_META[accessType].icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" /> Share &amp; Permissions
          </DialogTitle>
          <DialogDescription>{dashboardName}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3 -mr-3">
          {/* Create panel */}
          <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Link name</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={dashboardName} />
            </div>

            <div className="space-y-1.5">
              <Label>Who can access</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(ACCESS_META) as ShareAccessType[]).map((k) => {
                  const M = ACCESS_META[k];
                  const active = accessType === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setAccessType(k)}
                      className={`text-left rounded-lg border p-3 transition ${
                        active ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "hover:bg-muted"
                      }`}
                    >
                      <M.icon className="h-4 w-4 mb-1 text-primary" />
                      <div className="text-sm font-semibold">{M.title}</div>
                      <div className="text-[11px] text-muted-foreground leading-snug">{M.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {accessType === "external_emails" && (
              <div className="space-y-2">
                <Label>Allowed emails (verified by one-time code)</Label>
                <div className="flex gap-2">
                  <Input
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
                    placeholder="person@example.org"
                    type="email"
                  />
                  <Button type="button" variant="secondary" onClick={addEmail}>Add</Button>
                </div>
                {emails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {emails.map((e) => (
                      <Badge key={e} variant="secondary" className="gap-1">
                        {e}
                        <button onClick={() => setEmails((p) => p.filter((x) => x !== e))}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {accessType === "internal_roles" && (
              <div className="space-y-2">
                <Label>Allowed roles</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ROLE_OPTIONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => toggleRole(r.value)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        roles.includes(r.value)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Auto-expire (optional)</Label>
              <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>

            <Button onClick={handleCreate} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Create share link
            </Button>
          </div>

          {/* Existing links */}
          <div className="mt-5 space-y-2">
            <div className="text-sm font-semibold text-muted-foreground">Existing links</div>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : shares.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No share links yet.</p>
            ) : (
              shares.map((s) => {
                const M = ACCESS_META[s.access_type];
                const expired = s.expires_at && new Date(s.expires_at).getTime() <= Date.now();
                return (
                  <div key={s.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium truncate">
                          <M.icon className="h-3.5 w-3.5 text-primary shrink-0" />
                          {s.label || dashboardName}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{M.title}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!s.is_active ? (
                          <Badge variant="destructive">Revoked</Badge>
                        ) : expired ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-400">Expired</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-emerald-700">Active</Badge>
                        )}
                      </div>
                    </div>

                    {s.access_type === "external_emails" && s.allowed_emails.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {s.allowed_emails.map((e) => (
                          <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>
                        ))}
                      </div>
                    )}
                    {s.access_type === "internal_roles" && s.allowed_roles.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {s.allowed_roles.map((r) => (
                          <Badge key={r} variant="outline" className="text-[10px]">
                            {ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {s.expires_at && (
                      <div className="text-[11px] text-muted-foreground">
                        Expires {new Date(s.expires_at).toLocaleString()}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Input readOnly value={shareUrl(s.token)} className="h-8 text-xs" />
                      <Button size="sm" variant="secondary" className="h-8" onClick={() => copyLink(s)}>
                        {copiedId === s.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} />
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          {s.is_active ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
                          {s.is_active ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                      <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => remove(s)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
