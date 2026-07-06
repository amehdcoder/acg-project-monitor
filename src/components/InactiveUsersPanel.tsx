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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  Mail,
  Loader2,
  Search,
  Trash2,
  Archive,
  FolderPlus,
  X,
  ChevronDown,
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

interface ProjectLite {
  id: string;
  name: string;
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
      return (r || "Unknown reason").replace(/_/g, " ");
  }
};

const safeText = (value: unknown, fallback = "—") => {
  if (typeof value === "string") return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
};

const safeDate = (value: unknown) => {
  const date = new Date(typeof value === "string" ? value : "");
  return Number.isNaN(date.getTime()) ? null : date;
};

const InactiveUsersPanel = () => {
  const { isAdmin, isOwner, profile: currentProfile } = useAuth();
  const [profiles, setProfiles] = useState<InactiveProfile[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({}); // user_id -> project_ids
  const [pickProject, setPickProject] = useState<Record<string, string>>({}); // user_id -> selected project to add
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const PAGE_SIZE = 25;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [collapsed, setCollapsed] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: profs }, { data: atts }, { data: projs }, { data: asgs }] = await Promise.all([
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
        supabase.from("projects").select("id,name").order("name"),
        supabase.from("user_project_assignments").select("user_id,project_id"),
      ]);
      setProfiles((profs as InactiveProfile[]) || []);
      setAttempts((atts as Attempt[]) || []);
      setProjects((projs as ProjectLite[]) || []);
      const map: Record<string, string[]> = {};
      ((asgs as { user_id: string; project_id: string }[]) || []).forEach((a) => {
        (map[a.user_id] ||= []).push(a.project_id);
      });
      setAssignments(map);
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

  const projectById = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [projects]);

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
    const known = new Set(profiles.map((p) => safeText(p.email, "").toLowerCase()));
    return attempts.filter((a) => !known.has((a.email || "").toLowerCase())).slice(0, 50);
  }, [attempts, profiles]);

  // ----- Dismiss (delete) blocked sign-in attempt logs -----
  const dismissAttempts = async (ids: string[], label: string) => {
    if (ids.length === 0) return;
    try {
      const { error } = await supabase.from("inactive_login_attempts").delete().in("id", ids);
      if (error) throw error;
      const idSet = new Set(ids);
      setAttempts((prev) => prev.filter((a) => !idSet.has(a.id)));
      toast({ title: "Dismissed", description: `${label} removed from the audit log.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to dismiss log", variant: "destructive" });
    }
  };

  const dismissAllAttempts = async () => {
    await dismissAttempts(
      attempts.map((a) => a.id),
      `${attempts.length} blocked attempt log${attempts.length === 1 ? "" : "s"}`,
    );
  };

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

  // ----- Assign a (re)activated user to a project -----
  const assignToProject = async (p: InactiveProfile, projectId: string) => {
    if (!projectId) return;
    try {
      const { error } = await supabase
        .from("user_project_assignments")
        .upsert(
          { user_id: p.user_id, project_id: projectId, assigned_by: currentProfile?.user_id },
          { onConflict: "user_id,project_id", ignoreDuplicates: true },
        );
      if (error) throw error;
      setAssignments((prev) => {
        const next = { ...prev };
        const list = new Set(next[p.user_id] || []);
        list.add(projectId);
        next[p.user_id] = Array.from(list);
        return next;
      });
      setPickProject((prev) => ({ ...prev, [p.user_id]: "" }));
      toast({ title: "Project assigned", description: `${p.email} → ${projectById.get(projectId) || "project"}.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to assign project", variant: "destructive" });
    }
  };

  const unassignFromProject = async (p: InactiveProfile, projectId: string) => {
    try {
      const { error } = await supabase
        .from("user_project_assignments")
        .delete()
        .eq("user_id", p.user_id)
        .eq("project_id", projectId);
      if (error) throw error;
      setAssignments((prev) => {
        const next = { ...prev };
        next[p.user_id] = (next[p.user_id] || []).filter((id) => id !== projectId);
        return next;
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to remove project", variant: "destructive" });
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
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex flex-1 items-start gap-2 text-left"
          aria-expanded={!collapsed}
        >
          <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`} />
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Archive className="h-4 w-4 text-destructive" />
              Deactivated / Pending Accounts & Sign-in Audit Log
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {profiles.length} archived account{profiles.length === 1 ? "" : "s"} · {attempts.length} blocked attempt log{attempts.length === 1 ? "" : "s"}
              {collapsed ? " · click to expand" : ""}
            </p>
          </div>
        </button>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      {!collapsed && (
      <CardContent className="space-y-4">

        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
            className="pl-8"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No deactivated or pending accounts in the archive.
          </p>
        ) : (
          <Accordion type="multiple" className="w-full">
            {filtered.slice(0, visibleCount).map((p) => {
              const userAttempts = attemptsByEmail[safeText(p.email, "").toLowerCase()] || [];
              const lastAttempt = userAttempts[0];
              const lastAttemptDate = safeDate(lastAttempt?.created_at);
              const userProjects = assignments[p.user_id] || [];
              return (
                <AccordionItem key={p.id} value={p.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex flex-1 items-center justify-between gap-3 pr-3">
                      <div className="text-left">
                        <div className="font-medium text-sm">
                          {safeText(`${p.first_name ?? ""} ${p.last_name ?? ""}`, safeText(p.email, "Unknown user"))}{" "}
                          <span className="text-muted-foreground font-normal">— {safeText(p.email)}</span>
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
                      {lastAttemptDate && (
                        <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
                          last try {formatDistanceToNow(lastAttemptDate, { addSuffix: true })}
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

                      {/* Project assignment — reactivate into same or new projects */}
                      <div className="rounded border bg-muted/30 p-3 space-y-2">
                        <div className="text-xs font-medium flex items-center gap-1.5">
                          <FolderPlus className="h-3.5 w-3.5" />
                          Project access
                        </div>
                        {userProjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {userProjects.map((pid) => (
                              <Badge key={pid} variant="secondary" className="text-[10px] gap-1 pr-1">
                                {projectById.get(pid) || "Project"}
                                <button
                                  type="button"
                                  onClick={() => unassignFromProject(p, pid)}
                                  className="rounded-full hover:bg-background/60 p-0.5"
                                  aria-label="Remove project"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">Not assigned to any project yet.</p>
                        )}
                        <div className="flex gap-2">
                          <Select
                            value={pickProject[p.user_id] || ""}
                            onValueChange={(v) => setPickProject((prev) => ({ ...prev, [p.user_id]: v }))}
                          >
                            <SelectTrigger className="h-8 text-xs flex-1">
                              <SelectValue placeholder="Assign to a project…" />
                            </SelectTrigger>
                            <SelectContent>
                              {projects
                                .filter((pr) => !userProjects.includes(pr.id))
                                .map((pr) => (
                                  <SelectItem key={pr.id} value={pr.id} className="text-xs">
                                    {pr.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!pickProject[p.user_id]}
                            onClick={() => assignToProject(p, pickProject[p.user_id])}
                          >
                            Add
                          </Button>
                        </div>
                      </div>

                      <div className="rounded border bg-muted/30">
                        <div className="px-3 py-1.5 text-xs font-medium border-b flex items-center justify-between">
                          <span>Blocked sign-in attempts</span>
                          {userAttempts.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11px]"
                              onClick={() =>
                                dismissAttempts(
                                  userAttempts.map((a) => a.id),
                                  `${userAttempts.length} log${userAttempts.length === 1 ? "" : "s"} for ${p.email}`,
                                )
                              }
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Dismiss all
                            </Button>
                          )}
                        </div>
                        {userAttempts.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">None recorded.</div>
                        ) : (
                          <ul className="divide-y text-xs max-h-56 overflow-auto">
                            {userAttempts.map((a) => (
                              <li key={a.id} className="px-3 py-2 flex flex-col gap-0.5">
                                <div className="flex justify-between gap-2 items-start">
                                  <span className="font-medium">{reasonLabel(a.reason)}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">
                                      {safeDate(a.created_at) ? format(safeDate(a.created_at)!, "yyyy-MM-dd HH:mm:ss") : "Unknown time"}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => dismissAttempts([a.id], "Log entry")}
                                      className="text-muted-foreground hover:text-destructive"
                                      aria-label="Dismiss log entry"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
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

        {!loading && filtered.length > visibleCount && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              Load more ({filtered.length - visibleCount} remaining)
            </Button>
          </div>
        )}

        {attempts.length > 0 && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={dismissAllAttempts}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Dismiss all sign-in logs
            </Button>
          </div>
        )}

        {orphanAttempts.length > 0 && (
          <div className="rounded border border-dashed bg-muted/20">
            <div className="px-3 py-1.5 text-xs font-medium border-b flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Attempts from unknown emails ({orphanAttempts.length})
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() =>
                  dismissAttempts(orphanAttempts.map((a) => a.id), `${orphanAttempts.length} unknown-email log(s)`)
                }
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Dismiss all
              </Button>
            </div>
            <ul className="divide-y text-xs max-h-48 overflow-auto">
              {orphanAttempts.map((a) => (
                <li key={a.id} className="px-3 py-2 flex justify-between gap-2 items-center">
                  <span>
                    <span className="font-medium">{safeText(a.email)}</span> — {reasonLabel(a.reason)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {safeDate(a.created_at) ? format(safeDate(a.created_at)!, "yyyy-MM-dd HH:mm") : "Unknown time"}
                    </span>
                    <button
                      type="button"
                      onClick={() => dismissAttempts([a.id], "Log entry")}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Dismiss log entry"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
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
