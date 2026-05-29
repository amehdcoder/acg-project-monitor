import { useState, useEffect, useMemo } from "react";
import { Shield, RefreshCw, User, ArrowRight, Activity, Search, Filter, Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";

interface UnifiedEntry {
  id: string;
  source: "audit" | "surveillance" | "inactive";
  action: string;
  actor_label: string;
  target_label: string;
  description?: string;
  reason?: string;
  loginMode?: string;
  metadata: Record<string, any>;
  created_at: string;
}

const AuditLogViewer = () => {
  const [entries, setEntries] = useState<UnifiedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterMode, setFilterMode] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [newCount, setNewCount] = useState(0);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [auditRes, surveillanceRes, inactiveRes] = await Promise.all([
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(150),
        supabase.from("admin_surveillance_log" as any).select("*").order("created_at", { ascending: false }).limit(150),
        supabase.from("inactive_login_attempts" as any).select("*").order("created_at", { ascending: false }).limit(150),
      ]);

      const auditEntries: UnifiedEntry[] = (auditRes.data || []).map((row: any) => {
        const meta = row.metadata || {};
        return {
          id: `audit-${row.id}`,
          source: "audit",
          action: row.action,
          actor_label: meta.admin_name || meta.admin_email || "Admin",
          target_label: meta.target_name || meta.target_email || "User",
          description: undefined,
          metadata: meta,
          created_at: row.created_at,
        };
      });

      const surveillanceEntries: UnifiedEntry[] = ((surveillanceRes.data as any[]) || []).map((row: any) => ({
        id: `surv-${row.id}`,
        source: "surveillance",
        action: row.action_type,
        actor_label: row.actor_email || "Unknown",
        target_label: row.target_entity ? `${row.target_entity}` : "—",
        description: row.action_description,
        metadata: row.metadata || {},
        created_at: row.created_at,
      }));

      const inactiveEntries: UnifiedEntry[] = ((inactiveRes.data as any[]) || []).map((row: any) => ({
        id: `inactive-${row.id}`,
        source: "inactive",
        action: row.reason || "inactive_login_attempt",
        actor_label: row.email || "Unknown",
        target_label: row.mode || "—",
        description: `Blocked: ${row.reason || "inactive account"}${row.ip_address ? ` · IP ${row.ip_address}` : ""}`,
        reason: row.reason,
        loginMode: row.mode,
        metadata: row.metadata || {},
        created_at: row.created_at,
      }));

      const merged = [...auditEntries, ...surveillanceEntries, ...inactiveEntries].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setEntries(merged);
      setNewCount(0);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();

    const auditChannel = supabase
      .channel("audit-logs-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, (payload) => {
        const row: any = payload.new;
        const meta = row.metadata || {};
        const entry: UnifiedEntry = {
          id: `audit-${row.id}`,
          source: "audit",
          action: row.action,
          actor_label: meta.admin_name || meta.admin_email || "Admin",
          target_label: meta.target_name || meta.target_email || "User",
          metadata: meta,
          created_at: row.created_at,
        };
        setEntries((prev) => [entry, ...prev].slice(0, 300));
        setNewCount((c) => c + 1);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setIsLive(true);
      });

    const survChannel = supabase
      .channel("surveillance-logs-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_surveillance_log" }, (payload) => {
        const row: any = payload.new;
        const entry: UnifiedEntry = {
          id: `surv-${row.id}`,
          source: "surveillance",
          action: row.action_type,
          actor_label: row.actor_email || "Unknown",
          target_label: row.target_entity || "—",
          description: row.action_description,
          metadata: row.metadata || {},
          created_at: row.created_at,
        };
        setEntries((prev) => [entry, ...prev].slice(0, 300));
        setNewCount((c) => c + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(auditChannel);
      supabase.removeChannel(survChannel);
      setIsLive(false);
    };
  }, []);

  const getActionLabel = (action: string) =>
    action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const getActionColor = (action: string) => {
    if (["impersonate", "impersonate_user", "deactivate", "deactivate_user", "delete_form", "delete_project", "delete_submission", "rushed_submission", "validation_failure"].includes(action))
      return "bg-destructive/15 text-destructive border-destructive/30";
    if (["role_change", "change_user_role"].includes(action))
      return "bg-blue-500/15 text-blue-700 border-blue-500/30";
    if (["activate", "activate_user", "approve_user"].includes(action))
      return "bg-green-500/15 text-green-700 border-green-500/30";
    if (["skipped_questions"].includes(action))
      return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    return "bg-muted text-muted-foreground border-border";
  };

  const uniqueActions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filterAction !== "all" && e.action !== filterAction) return false;
      if (!q) return true;
      return (
        e.action.toLowerCase().includes(q) ||
        e.actor_label.toLowerCase().includes(q) ||
        e.target_label.toLowerCase().includes(q) ||
        (e.description || "").toLowerCase().includes(q)
      );
    });
  }, [entries, search, filterAction]);

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Audit Log
            {isLive && (
              <Badge variant="outline" className="bg-green-500/15 text-green-700 border-green-500/30 gap-1 text-[10px] font-normal">
                <Radio className="h-2.5 w-2.5 animate-pulse" />
                LIVE
              </Badge>
            )}
            {newCount > 0 && (
              <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30 text-[10px]">
                +{newCount} new
              </Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={fetchAll} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search actor, target, action..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-xs"
            />
          </div>
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="h-9 w-full sm:w-[180px] text-xs">
              <Filter className="h-3.5 w-3.5 mr-1" />
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {uniqueActions.map((a) => (
                <SelectItem key={a} value={a}>{getActionLabel(a)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 && !isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {entries.length === 0 ? "No audit log entries yet" : "No entries match the filter"}
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-3">
            <div className="space-y-3">
              {filtered.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className={getActionColor(log.action)}>
                        {getActionLabel(log.action)}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] uppercase tracking-wide bg-muted/50 text-muted-foreground border-border">
                        {log.source === "audit" ? "Admin" : "Activity"}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10 shrink-0">
                        <User className="h-3 w-3 text-destructive" />
                      </div>
                      <span className="font-medium text-foreground truncate max-w-[180px]">
                        {log.actor_label}
                      </span>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 shrink-0">
                        {log.source === "audit" ? (
                          <User className="h-3 w-3 text-primary" />
                        ) : (
                          <Activity className="h-3 w-3 text-primary" />
                        )}
                      </div>
                      <span className="font-medium text-foreground truncate max-w-[200px]">
                        {log.target_label}
                      </span>
                    </div>
                  </div>
                  {log.description && (
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                      {log.description}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground/80 mt-1.5">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default AuditLogViewer;
