import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  Mail,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, formatDistanceToNow } from "date-fns";

interface InactiveProfile {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  approval_status: string;
  created_at: string;
}

interface Attempt {
  id: string;
  email: string;
  attempted_user_id: string | null;
  reason: string;
  mode: string;
  user_agent: string | null;
  ip_address: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

const reasonLabel = (r: string) => {
  switch (r) {
    case "account_deactivated":
      return "Account deactivated";
    case "super_admin_grant_blocked":
      return "Super Admin grant blocked";
    case "is_owner_grant_blocked":
      return "Owner grant blocked";
    default:
      return r.replace(/_/g, " ");
  }
};

const InactiveUsersPanel = () => {
  const { isAdmin, isOwner } = useAuth();
  const [profiles, setProfiles] = useState<InactiveProfile[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const PAGE_SIZE = 25;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: profs }, { data: atts }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,user_id,email,first_name,last_name,is_active,approval_status,created_at")
          .or("is_active.eq.false,approval_status.eq.pending,approval_status.eq.rejected")
          .order("created_at", { ascending: false }),
        supabase
          .from("inactive_login_attempts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      setProfiles((profs as InactiveProfile[]) || []);
      setAttempts((atts as Attempt[]) || []);
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to load inactive users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin || isOwner) load();
  }, [isAdmin, isOwner, load]);

  const attemptsByEmail = useMemo(() => {
    const map: Record<string, Attempt[]> = {};
    for (const a of attempts) {
      const k = (a.email || "").toLowerCase();
      (map[k] ||= []).push(a);
    }
    return map;
  }, [attempts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.email?.toLowerCase().includes(q) ||
        `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase().includes(q),
    );
  }, [profiles, search]);

  // Orphan attempts: emails in logs with no matching inactive profile (e.g. wrong email entered)
  const orphanAttempts = useMemo(() => {
    const known = new Set(profiles.map((p) => p.email.toLowerCase()));
    return attempts.filter((a) => !known.has((a.email || "").toLowerCase())).slice(0, 50);
  }, [attempts, profiles]);

  const notifyByEmail = async (
    p: InactiveProfile,
    subject: string,
    heading: string,
    bodyHtml: string,
  ) => {
    try {
      const name = `${p.first_name ?? ""}`.trim() || "there";
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(90deg,#0F766E,#B45309);padding:18px 24px;color:#ffffff;">
            <div style="font-size:20px;font-weight:700;">Amehnities</div>
            <div style="font-size:12px;opacity:.9;">Public Health Monitoring &amp; Field Intelligence</div>
          </div>
          <div style="padding:28px;color:#1f2937;font-size:15px;line-height:1.6;">
            <h1 style="font-size:20px;margin:0 0 12px;">${heading}</h1>
            <p style="margin:0 0 12px;">Hello ${name},</p>
            ${bodyHtml}
            <p style="margin:16px 0 0;">
              <a href="https://www.amehnities.org" style="background:#0F766E;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;display:inline-block;font-weight:600;">Sign in to Amehnities</a>
            </p>
          </div>
          <div style="background:#f9fafb;padding:14px 24px;font-size:11px;color:#6b7280;text-align:center;border-top:1px solid #e5e7eb;">
            &copy; ${new Date().getFullYear()} Amehnities &middot; amehnities.org
          </div>
        </div>`;
      await supabase.functions.invoke("send-email-smtp", {
        body: { to: p.email, subject, html },
      });
    } catch (e) {
      console.error("Email notification failed:", e);
    }
  };

  const reactivate = async (p: InactiveProfile) => {
    setBusyId(p.id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: true, approval_status: "approved" })
        .eq("id", p.id);
      if (error) throw error;
      await supabase.from("notifications").insert({
        user_id: p.user_id,
        title: "✅ Account Reactivated",
        message: "Your Amehnities account has been reactivated. You can now sign in.",
        type: "success",
        category: "account",
      });
      await notifyByEmail(
        p,
        "Your Amehnities account has been reactivated",
        "Your account is active again",
        "<p>Good news — an administrator has reactivated your Amehnities account. You can now sign in and resume your work.</p>",
      );
      toast({ title: "User reactivated", description: `${p.email} notified by email.` });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to reactivate", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const setApproval = async (p: InactiveProfile, status: "approved" | "rejected") => {
    setBusyId(p.id);
    try {
      const updates: any = { approval_status: status };
      if (status === "approved") updates.is_active = true;
      const { error } = await supabase.from("profiles").update(updates).eq("id", p.id);
      if (error) throw error;
      await supabase.from("notifications").insert({
        user_id: p.user_id,
        title: status === "approved" ? "✅ Account Approved" : "❌ Account Decision",
        message:
          status === "approved"
            ? "Your account has been approved! You now have full access to Amehnities."
            : "Your registration has been reviewed and was not approved. Please contact an administrator.",
        type: status === "approved" ? "success" : "error",
        category: "approval",
      });
      await notifyByEmail(
        p,
        status === "approved" ? "Your Amehnities account has been approved" : "Update on your Amehnities registration",
        status === "approved" ? "Your account is approved" : "Your registration decision",
        status === "approved"
          ? "<p>Your registration has been approved. You now have full access to Amehnities and can sign in right away.</p>"
          : "<p>Your registration has been reviewed and was not approved at this time. If you believe this is a mistake, please reply to this email or contact an administrator.</p>",
      );
      toast({
        title: status === "approved" ? "Approval resent" : "Decision recorded",
        description: `${p.email} notified by email.`,
      });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to update", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin && !isOwner) return null;

  return (
    <Card className="border-destructive/40">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Inactive / Pending Users & Blocked Sign-in Attempts
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {profiles.length} inactive/pending · {attempts.length} blocked attempts logged
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No inactive or pending users.
          </p>
        ) : (
          <Accordion type="multiple" className="w-full">
            {filtered.map((p) => {
              const userAttempts = attemptsByEmail[p.email.toLowerCase()] || [];
              const lastAttempt = userAttempts[0];
              return (
                <AccordionItem key={p.id} value={p.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex flex-1 items-center justify-between gap-3 pr-3">
                      <div className="text-left">
                        <div className="font-medium text-sm">
                          {p.first_name} {p.last_name}{" "}
                          <span className="text-muted-foreground font-normal">— {p.email}</span>
                        </div>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          {!p.is_active && (
                            <Badge variant="destructive" className="text-[10px]">Deactivated</Badge>
                          )}
                          {p.approval_status === "pending" && (
                            <Badge variant="secondary" className="text-[10px]">Pending approval</Badge>
                          )}
                          {p.approval_status === "rejected" && (
                            <Badge variant="outline" className="text-[10px]">Rejected</Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            {userAttempts.length} attempt{userAttempts.length === 1 ? "" : "s"}
                          </Badge>
                        </div>
                      </div>
                      {lastAttempt && (
                        <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
                          last try {formatDistanceToNow(new Date(lastAttempt.created_at), { addSuffix: true })}
                        </div>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      <div className="flex flex-wrap gap-2">
                        {!p.is_active && (
                          <Button
                            size="sm"
                            onClick={() => reactivate(p)}
                            disabled={busyId === p.id}
                          >
                            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                            Re-activate
                          </Button>
                        )}
                        {p.approval_status !== "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setApproval(p, "approved")}
                            disabled={busyId === p.id}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            Resend approval
                          </Button>
                        )}
                        {p.approval_status !== "rejected" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setApproval(p, "rejected")}
                            disabled={busyId === p.id}
                          >
                            <Mail className="h-3.5 w-3.5 mr-1.5" />
                            Send rejection
                          </Button>
                        )}
                      </div>

                      <div className="rounded border bg-muted/30">
                        <div className="px-3 py-1.5 text-xs font-medium border-b">
                          Blocked sign-in attempts
                        </div>
                        {userAttempts.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">None recorded.</div>
                        ) : (
                          <ul className="divide-y text-xs max-h-56 overflow-auto">
                            {userAttempts.map((a) => (
                              <li key={a.id} className="px-3 py-2 flex flex-col gap-0.5">
                                <div className="flex justify-between gap-2">
                                  <span className="font-medium">{reasonLabel(a.reason)}</span>
                                  <span className="text-muted-foreground">
                                    {format(new Date(a.created_at), "yyyy-MM-dd HH:mm:ss")}
                                  </span>
                                </div>
                                <div className="text-muted-foreground">
                                  mode: {a.mode}
                                  {a.metadata?.stage ? ` · stage: ${a.metadata.stage}` : ""}
                                  {a.metadata?.approval_status
                                    ? ` · approval: ${a.metadata.approval_status}`
                                    : ""}
                                </div>
                                {a.user_agent && (
                                  <div className="text-muted-foreground truncate" title={a.user_agent}>
                                    {a.user_agent}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}

        {orphanAttempts.length > 0 && (
          <div className="rounded border border-dashed bg-muted/20">
            <div className="px-3 py-1.5 text-xs font-medium border-b">
              Attempts from unknown emails ({orphanAttempts.length})
            </div>
            <ul className="divide-y text-xs max-h-48 overflow-auto">
              {orphanAttempts.map((a) => (
                <li key={a.id} className="px-3 py-2 flex justify-between gap-2">
                  <span>
                    <span className="font-medium">{a.email}</span> — {reasonLabel(a.reason)}
                  </span>
                  <span className="text-muted-foreground">
                    {format(new Date(a.created_at), "yyyy-MM-dd HH:mm")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default InactiveUsersPanel;
