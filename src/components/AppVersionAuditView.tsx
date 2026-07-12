import { useState, useEffect, useCallback, useMemo } from "react";
import {
  RefreshCw, Loader2, CheckCircle2, AlertTriangle, AlertOctagon, Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import {
  LATEST_PUBLISHED_VERSION,
  classifyVersionStatus,
  type VersionStatus,
} from "@/config/appVersion";

interface AuditRow {
  user_id: string;
  name: string;
  email: string;
  current_version: string | null;
  last_seen_at: string | null;
  status: VersionStatus;
}

const STATUS_META: Record<
  VersionStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  current: {
    label: "Current",
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    icon: CheckCircle2,
  },
  pending: {
    label: "Update Pending",
    className: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    icon: AlertTriangle,
  },
  drift: {
    label: "Schema Drift Risk",
    className: "bg-destructive/15 text-destructive border-destructive/30",
    icon: AlertOctagon,
  },
};

const StatusBadge = ({ status }: { status: VersionStatus }) => {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1 font-semibold ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
};

const AppVersionAuditView = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<VersionStatus | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email, current_version, last_seen_at")
        .order("last_seen_at", { ascending: false, nullsFirst: false });

      if (error) throw error;

      const mapped: AuditRow[] = (data || []).map((p) => ({
        user_id: p.user_id,
        name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed user",
        email: p.email || "—",
        current_version: p.current_version,
        last_seen_at: p.last_seen_at,
        status: classifyVersionStatus(p.current_version, p.last_seen_at),
      }));
      setRows(mapped);
    } catch (e) {
      console.error("[AppVersionAudit] Failed to load", e);
      toast({
        title: "Could not load version audit",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      current: rows.filter((r) => r.status === "current").length,
      pending: rows.filter((r) => r.status === "pending").length,
      drift: rows.filter((r) => r.status === "drift").length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.current_version || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">App Version Audit</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Latest published version:{" "}
              <span className="font-mono font-semibold text-foreground">
                {LATEST_PUBLISHED_VERSION}
              </span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {(["current", "pending", "drift"] as const).map((s) => {
              const meta = STATUS_META[s];
              const Icon = meta.icon;
              const active = filter === s;
              return (
                <button
                  key={s}
                  onClick={() => setFilter(active ? "all" : s)}
                  className={`rounded-lg border p-3 text-left transition ${meta.className} ${
                    active ? "ring-2 ring-offset-1 ring-current" : "opacity-90 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-semibold">{meta.label}</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold">{counts[s]}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or version…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[520px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Last Synced</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      No users match the current filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.user_id}>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {r.current_version || <span className="text-muted-foreground">unknown</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.last_seen_at ? (
                          <span title={format(new Date(r.last_seen_at), "PPpp")}>
                            {formatDistanceToNow(new Date(r.last_seen_at), { addSuffix: true })}
                          </span>
                        ) : (
                          "Never"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusBadge status={r.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default AppVersionAuditView;
