import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutDashboard, Lock, Network } from "lucide-react";
import Dhis2MicroplanEngine from "@/components/Microplanning/Dhis2MicroplanEngine";
import Dhis2DashboardStudio from "./Dhis2DashboardStudio";

type Conn = { id: string; name: string; base_url: string };

export default function Dhis2IntegrationsHub({ projects }: { projects: { id: string; name: string }[] }) {
  const { isAdmin, isOwner, isSuperAdmin } = useAuth();
  const canUse = !!(isAdmin || isOwner || isSuperAdmin);
  const [projectId, setProjectId] = useState("");
  const [conn, setConn] = useState<Conn | null>(null);
  const [studio, setStudio] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => { if (!projectId && projects[0]) setProjectId(projects[0].id); }, [projects, projectId]);
  useEffect(() => {
    if (!projectId) { setConn(null); return; }
    supabase.from("health_exchange_connections").select("id,name,base_url")
      .eq("kind", "dhis2").eq("is_active", true).eq("scope", "integrations").eq("project_id", projectId)
      .order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => setConn((data?.[0] as Conn) ?? null));
  }, [projectId, tick]);

  const projectName = projects.find((p) => p.id === projectId)?.name;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <Network className="h-5 w-5 text-primary mt-1" strokeWidth={1.5} />
          <div>
            <h2 className="text-lg font-semibold text-foreground">DHIS2 Data Exchange</h2>
            <p className="text-sm text-muted-foreground">Push and pull data, explore the full DHIS2 setup and import live DHIS2 dashboards.</p>
          </div>
        </div>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-64 h-9"><SelectValue placeholder="Choose a project" /></SelectTrigger>
          <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_340px]" onClickCapture={() => setTimeout(() => setTick((t) => t + 1), 4000)}>
        <Dhis2MicroplanEngine projectId={projectId} projectName={projectName} canUse={canUse} scope="integrations" />
        <Card className="p-4 flex flex-col gap-3 border-primary/20">
          <div className="flex items-start gap-3">
            <LayoutDashboard className="h-5 w-5 text-primary mt-0.5" strokeWidth={1.5} />
            <div>
              <h3 className="text-sm font-semibold text-foreground">DHIS2 Dashboard Import</h3>
              <p className="text-xs text-muted-foreground">Opens an exact replica of your DHIS2 dashboards — same layout, charts and tables — with a data pivot on every item.</p>
            </div>
          </div>
          <Button size="sm" disabled={!canUse || !conn} onClick={() => setStudio(true)}>
            <LayoutDashboard className="h-3.5 w-3.5 mr-1" /> Open DHIS2 dashboards
          </Button>
          {(!canUse || !conn) && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />{!canUse ? "Only Admins, Owners and Super Admins can open DHIS2 dashboards" : "Connect DHIS2 for this project first"}</p>}
        </Card>
      </div>
      {conn && <Dhis2DashboardStudio open={studio} onOpenChange={setStudio} connId={conn.id} connName={conn.name} baseUrl={conn.base_url} />}
    </section>
  );
}
