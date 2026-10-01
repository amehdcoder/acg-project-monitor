import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight, Database, LayoutDashboard, Lock, Network, Waypoints } from "lucide-react";
import Dhis2MicroplanEngine from "@/components/Microplanning/Dhis2MicroplanEngine";
import Dhis2DashboardStudio from "./Dhis2DashboardStudio";
import { openAppTab, setImportedDashboard } from "./dhis2ImportedDashboard";
import { toast } from "sonner";

type Conn = { id: string; name: string; base_url: string };
type ExchangeStats = { dataSets: number; mappings: number; submissions: number };

const EMPTY_STATS: ExchangeStats = { dataSets: 0, mappings: 0, submissions: 0 };

export default function Dhis2IntegrationsHub({ projects }: { projects: { id: string; name: string }[] }) {
  const { isAdmin, isOwner, isSuperAdmin } = useAuth();
  const canUse = !!(isAdmin || isOwner || isSuperAdmin);
  const [projectId, setProjectId] = useState("");
  const [conn, setConn] = useState<Conn | null>(null);
  const [studio, setStudio] = useState(false);
  const [tick, setTick] = useState(0);
  const [stats, setStats] = useState<ExchangeStats>(EMPTY_STATS);

  useEffect(() => { if (!projectId && projects[0]) setProjectId(projects[0].id); }, [projects, projectId]);
  useEffect(() => {
    if (!projectId) { setConn(null); return; }
    supabase.from("health_exchange_connections").select("id,name,base_url")
      .eq("kind", "dhis2").eq("is_active", true).eq("scope", "integrations").eq("project_id", projectId)
      .order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => setConn((data?.[0] as Conn) ?? null));
  }, [projectId, tick]);

  useEffect(() => {
    let current = true;
    if (!projectId || !conn?.id) { setStats(EMPTY_STATS); return () => { current = false; }; }
    const loadStats = async () => {
      const [mappingResult, logResult] = await Promise.all([
        supabase.from("health_exchange_mappings").select("id", { count: "exact", head: true }).eq("connection_id", conn.id),
        supabase.from("health_exchange_sync_logs").select("direction,action,status,record_count")
          .eq("connection_id", conn.id).in("status", ["success", "partial"]),
      ]);
      if (!current) return;
      const logs = logResult.data ?? [];
      const transferred = logs
        .filter((log) => log.direction !== "test" && !log.action.includes("dry_run") && !log.action.includes("validation"))
        .reduce((total, log) => total + Math.max(0, Number(log.record_count) || 0), 0);
      setStats({
        dataSets: logs.filter((log) => log.direction === "pull" && !log.action.includes("structure")).length,
        mappings: mappingResult.count ?? 0,
        submissions: transferred,
      });
    };
    loadStats();
    return () => { current = false; };
  }, [projectId, conn?.id, tick]);

  const projectName = projects.find((p) => p.id === projectId)?.name;

  return (
    <section className="dhis2-exchange space-y-5 rounded-xl bg-muted/30 p-3 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Network className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">DHIS2 Data Exchange</h2>
            <p className="text-sm text-muted-foreground">Push and pull data, explore the full DHIS2 setup and import live DHIS2 dashboards.</p>
          </div>
        </div>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-64 h-9"><SelectValue placeholder="Choose a project" /></SelectTrigger>
          <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Total data sets synced", value: stats.dataSets, icon: Database },
          { label: "Active mappings", value: stats.mappings, icon: Waypoints },
          { label: "Submissions transferred", value: stats.submissions, icon: ArrowLeftRight },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value.toLocaleString()}</p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]" onClickCapture={() => setTimeout(() => setTick((t) => t + 1), 4000)}>
        <Dhis2MicroplanEngine projectId={projectId} projectName={projectName} canUse={canUse} scope="integrations" onExchangeActivity={() => setTick((t) => t + 1)} />
        <Card className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutDashboard className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">DHIS2 Dashboard Import</h3>
              <p className="text-xs text-muted-foreground">Opens an exact replica of your DHIS2 dashboards — same layout, charts and tables — with a data pivot on every item.</p>
            </div>
          </div>
          <Button size="sm" disabled={!canUse || !conn} onClick={() => setStudio(true)}>
            <LayoutDashboard className="h-3.5 w-3.5 mr-1" /> Open DHIS2 dashboards
          </Button>
          {(!canUse || !conn) && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />{!canUse ? "Only Admins, Owners and Super Admins can open DHIS2 dashboards" : "Connect DHIS2 for this project first"}</p>}
        </Card>
      </div>
      {conn && <Dhis2DashboardStudio open={studio} onOpenChange={setStudio} connId={conn.id} connName={conn.name} baseUrl={conn.base_url}
        onImport={(d) => {
          setImportedDashboard({ projectId, projectName, connId: conn.id, dashboardId: d.id, dashboardName: d.name, importedAt: new Date().toISOString() });
          setStudio(false); toast.success(`“${d.name}” imported to the DHIS2 Dashboard page`); openAppTab("dhis2-dashboard");
        }} />}
    </section>
  );
}
