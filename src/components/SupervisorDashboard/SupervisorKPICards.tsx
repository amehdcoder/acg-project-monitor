import { Users, Activity, ShieldCheck, AlertTriangle, TrendingUp, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EnumeratorStatus, SupervisorAlert, DailyActivitySummary } from "@/hooks/useSupervisorDashboard";

interface Props {
  enumerators: EnumeratorStatus[];
  alerts: SupervisorAlert[];
  dailySummary: DailyActivitySummary | null;
}

const SupervisorKPICards = ({ enumerators, alerts, dailySummary }: Props) => {
  const active = enumerators.filter(e => e.status === "active").length;
  const idle = enumerators.filter(e => e.status === "idle").length;
  const offline = enumerators.filter(e => e.status === "offline").length;
  const totalToday = dailySummary?.total_submissions || 0;
  const compliance = dailySummary?.geofence_compliance_avg || 100;
  const criticalAlerts = alerts.filter(a => a.severity === "critical").length;

  const kpis = [
    {
      label: "Active Now",
      value: active,
      subtitle: `${idle} idle · ${offline} offline`,
      icon: Activity,
      color: "text-green-600",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Total Enumerators",
      value: enumerators.length,
      subtitle: "Assigned field workers",
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Submissions Today",
      value: totalToday,
      subtitle: `Avg ${enumerators.length > 0 ? (totalToday / enumerators.length).toFixed(1) : 0}/person`,
      icon: TrendingUp,
      color: "text-acg-gold",
      bgColor: "bg-acg-gold/10",
    },
    {
      label: "Geofence Compliance",
      value: `${compliance}%`,
      subtitle: compliance >= 90 ? "Excellent" : compliance >= 70 ? "Needs attention" : "Critical",
      icon: ShieldCheck,
      color: compliance >= 90 ? "text-green-600" : compliance >= 70 ? "text-amber-600" : "text-destructive",
      bgColor: compliance >= 90 ? "bg-green-500/10" : compliance >= 70 ? "bg-amber-500/10" : "bg-destructive/10",
    },
    {
      label: "Active Alerts",
      value: alerts.length,
      subtitle: criticalAlerts > 0 ? `${criticalAlerts} critical` : "All clear",
      icon: AlertTriangle,
      color: criticalAlerts > 0 ? "text-destructive" : "text-muted-foreground",
      bgColor: criticalAlerts > 0 ? "bg-destructive/10" : "bg-muted",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className={`rounded-lg p-2 ${kpi.bgColor}`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
            </div>
            <div className="mt-3">
              <p className="font-display text-2xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-sm font-medium text-foreground">{kpi.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{kpi.subtitle}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default SupervisorKPICards;
