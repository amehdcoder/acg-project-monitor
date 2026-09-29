import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Network, X } from "lucide-react";
import Dhis2DashboardStudio from "./Dhis2DashboardStudio";
import { ImportedDashboard, getImportedDashboard, openAppTab, setImportedDashboard } from "./dhis2ImportedDashboard";

type Conn = { id: string; name: string; base_url: string };

export default function Dhis2DashboardPage() {
  const [imp, setImp] = useState<ImportedDashboard | null>(getImportedDashboard());
  const [conn, setConn] = useState<Conn | null | undefined>(undefined);

  useEffect(() => {
    const h = () => setImp(getImportedDashboard());
    window.addEventListener("amehnities:dhis2-dashboard-changed", h);
    return () => window.removeEventListener("amehnities:dhis2-dashboard-changed", h);
  }, []);

  useEffect(() => {
    if (!imp) { setConn(null); return; }
    setConn(undefined);
    supabase.from("health_exchange_connections").select("id,name,base_url")
      .eq("id", imp.connId).eq("is_active", true).maybeSingle()
      .then(({ data }) => setConn((data as Conn) ?? null));
  }, [imp]);

  const empty = (msg: string) => (
    <Card className="p-10 flex flex-col items-center text-center gap-3 max-w-xl mx-auto mt-10">
      <LayoutDashboard className="h-8 w-8 text-primary" strokeWidth={1.5} />
      <h2 className="text-lg font-semibold text-foreground">DHIS2 Dashboard</h2>
      <p className="text-sm text-muted-foreground">{msg}</p>
      <Button size="sm" onClick={() => openAppTab("integrations")}><Network className="h-3.5 w-3.5 mr-1" />Go to Integrations</Button>
    </Card>
  );

  if (!imp) return empty("No dashboard imported yet. On Integrations, open DHIS2 dashboards, pick one and press “Import to DHIS2 Dashboard page”.");
  if (conn === null) return empty("The DHIS2 connection used for this dashboard is no longer active. Reconnect DHIS2 on Integrations and import the dashboard again.");

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-foreground">DHIS2 Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            {imp.dashboardName}{imp.projectName ? ` · ${imp.projectName}` : ""} · imported {new Date(imp.importedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => openAppTab("integrations")}>Change dashboard</Button>
          <Button size="sm" variant="ghost" onClick={() => setImportedDashboard(null)}><X className="h-3.5 w-3.5 mr-1" />Remove</Button>
        </div>
      </div>
      {conn && (
        <Dhis2DashboardStudio embedded open onOpenChange={() => {}} connId={conn.id} connName={conn.name} baseUrl={conn.base_url}
          initialDashboardId={imp.dashboardId} lockToInitial />
      )}
    </section>
  );
}
