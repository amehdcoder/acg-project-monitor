import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldAlert, RefreshCcw, Loader2, Sheet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface AuditRow {
  id: string;
  event_type: string;
  email: string | null;
  success: boolean | null;
  device_id: string | null;
  details: Record<string, unknown> | null;
  occurred_at: string | null;
  created_at: string;
}

const EVENT_LABEL: Record<string, string> = {
  offline_login_attempt: "Offline login attempt",
  offline_login_success: "Offline login success",
  offline_login_failure: "Offline login failure",
  cache_seed: "Cache seeded",
  cache_reveal: "Cache revealed",
  cache_export: "Profile exported",
  cache_import: "Profile imported",
  cache_invalidate: "Cache invalidated",
};

const tone = (event: string, success: boolean | null) => {
  if (event.includes("failure") || success === false) return "destructive" as const;
  if (event.includes("success") || event === "cache_seed") return "default" as const;
  return "secondary" as const;
};

export default function OfflineAuditLogPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sheetId, setSheetId] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("offline_auth_audit" as any)
      .select("id,event_type,email,success,device_id,details,occurred_at,created_at")
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (error) toast.error(`Could not load audit log: ${error.message}`);
    setRows(((data as unknown) as AuditRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSync = async () => {
    const id = sheetId.trim();
    if (!id) {
      toast.error("Paste the Google Sheet ID or URL to sync to.");
      return;
    }
    // Accept a full URL or a bare ID.
    const match = id.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const spreadsheetId = match ? match[1] : id;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-sheets", {
        body: { action: "sync_offline_audit", spreadsheetId },
      });
      if (error) throw error;
      toast.success((data as any)?.message || "Synced offline audit events to Google Sheets");
    } catch (e) {
      toast.error(`Sync failed: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldAlert className="h-5 w-5 text-primary" />Offline Login Audit Trail
        </CardTitle>
        <CardDescription>
          Offline login attempts and credential cache lifecycle events (seed, export, import, invalidate). Export to
          Google Sheets / Looker Studio for monitoring.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
            placeholder="Google Sheet ID or URL"
          />
          <Button onClick={handleSync} disabled={syncing} className="gap-2 sm:w-48">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sheet className="h-4 w-4" />}
            Sync to Sheets
          </Button>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Refresh">
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <ScrollArea className="h-80 rounded-md border border-border">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No offline audit events recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Device</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      {new Date(r.occurred_at || r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant={tone(r.event_type, r.success)} className="text-[10px]">
                        {EVENT_LABEL[r.event_type] || r.event_type}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-xs">{r.email || "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                      {r.device_id ? r.device_id.slice(0, 12) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
