import { useState, useEffect } from "react";
import { Shield, Clock, RefreshCw, User, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";

interface AuditEntry {
  id: string;
  admin_user_id: string;
  target_user_id: string;
  action: string;
  metadata: Record<string, any> | null;
  created_at: string;
}

const AuditLogViewer = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs((data || []) as AuditEntry[]);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getActionLabel = (action: string) => {
    switch (action) {
      case "impersonate": return "Impersonated User";
      case "role_change": return "Changed Role";
      case "deactivate": return "Deactivated User";
      case "activate": return "Activated User";
      default: return action;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "impersonate": return "bg-amber-500/15 text-amber-700 border-amber-500/30";
      case "role_change": return "bg-blue-500/15 text-blue-700 border-blue-500/30";
      case "deactivate": return "bg-destructive/15 text-destructive border-destructive/30";
      case "activate": return "bg-green-500/15 text-green-700 border-green-500/30";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Audit Log
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={fetchLogs} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 && !isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No audit log entries yet
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-3">
              {logs.map((log) => {
                const meta = log.metadata || {};
                return (
                  <div
                    key={log.id}
                    className="rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge variant="outline" className={getActionColor(log.action)}>
                        {getActionLabel(log.action)}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10">
                          <User className="h-3 w-3 text-destructive" />
                        </div>
                        <span className="font-medium text-foreground">
                          {meta.admin_name || meta.admin_email || "Admin"}
                        </span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                          <User className="h-3 w-3 text-primary" />
                        </div>
                        <span className="font-medium text-foreground">
                          {meta.target_name || meta.target_email || "User"}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </p>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default AuditLogViewer;
