import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Search, Eye, RefreshCw, Lock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useAdminSurveillance } from "@/hooks/useAdminSurveillance";

interface SurveillanceEntry {
  id: string;
  actor_id: string;
  actor_email: string;
  actor_role: string;
  action_type: string;
  action_description: string;
  target_entity: string | null;
  target_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const AdminSurveillanceView = () => {
  const [entries, setEntries] = useState<SurveillanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");
  const { logAction } = useAdminSurveillance();

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("admin_surveillance_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (!error && data) {
        setEntries(data as unknown as SurveillanceEntry[]);
      }
    } catch (e) {
      console.error("Failed to fetch surveillance logs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    logAction("view_surveillance_logs", "Accessed the surveillance log page");
  }, []);

  const filteredEntries = entries.filter((e) => {
    const matchesSearch =
      !searchTerm ||
      e.actor_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.action_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.action_type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = filterAction === "all" || e.action_type === filterAction;
    const matchesRole = filterRole === "all" || e.actor_role === filterRole;
    return matchesSearch && matchesAction && matchesRole;
  });

  const actionTypes = [...new Set(entries.map((e) => e.action_type))];

  const getActionBadgeVariant = (action: string): "default" | "destructive" | "secondary" | "outline" => {
    if (action.includes("delete") || action.includes("revoke") || action.includes("deactivate")) return "destructive";
    if (action.includes("view") || action.includes("export")) return "secondary";
    if (action.includes("impersonate")) return "default";
    return "outline";
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <Lock className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-xl font-display flex items-center gap-2">
                <Shield className="h-5 w-5 text-destructive" />
                Admin Surveillance Log
              </CardTitle>
              <CardDescription className="text-destructive/70">
                Tamper-proof record — immutable, no edits or deletions possible. Owner access only.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email, action, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Action type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actionTypes.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
                <SelectItem value="systems_admin">Systems Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchLogs}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-foreground">{entries.length}</p>
            <p className="text-xs text-muted-foreground">Total Records</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-foreground">{new Set(entries.map(e => e.actor_email)).size}</p>
            <p className="text-xs text-muted-foreground">Unique Actors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-destructive">
              {entries.filter(e => e.action_type.includes("delete") || e.action_type.includes("impersonate")).length}
            </p>
            <p className="text-xs text-muted-foreground">Critical Actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-foreground">
              {entries.filter(e => {
                const d = new Date(e.created_at);
                const now = new Date();
                return now.getTime() - d.getTime() < 86400000;
              }).length}
            </p>
            <p className="text-xs text-muted-foreground">Last 24h</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-4 p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No surveillance records found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Timestamp</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id} className={
                      entry.action_type.includes("delete") || entry.action_type.includes("impersonate")
                        ? "bg-destructive/5"
                        : ""
                    }>
                      <TableCell className="text-xs font-mono whitespace-nowrap">
                        {format(new Date(entry.created_at), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-xs max-w-32 truncate" title={entry.actor_email}>
                        {entry.actor_email}
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.actor_role === "super_admin" ? "destructive" : "secondary"} className="text-[10px]">
                          {entry.actor_role.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(entry.action_type)} className="text-[10px]">
                          {entry.action_type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-48 truncate" title={entry.action_description}>
                        {entry.action_description}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.target_entity && (
                          <span>{entry.target_entity}{entry.target_id ? `: ${entry.target_id.slice(0, 8)}...` : ""}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSurveillanceView;
