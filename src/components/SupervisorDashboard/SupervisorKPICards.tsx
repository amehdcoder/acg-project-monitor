import { Users, Activity, ShieldCheck, AlertTriangle, TrendingUp, FileText, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { UserStatus, SupervisorAlert, DailyActivitySummary } from "@/hooks/useSupervisorDashboard";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  enumerators: UserStatus[];
  alerts: SupervisorAlert[];
  dailySummary: DailyActivitySummary | null;
}

const SupervisorKPICards = ({ enumerators, alerts, dailySummary }: Props) => {
  const { t } = useLanguage();

  // Derive all stats from real data
  const fieldWorkers = enumerators.filter(e => e.assigned_forms.length > 0 && e.is_active);
  const activeFieldWorkers = fieldWorkers.filter(e => e.status === "active").length;
  const idleFieldWorkers = fieldWorkers.filter(e => e.status === "idle").length;
  const offlineFieldWorkers = fieldWorkers.filter(e => e.status === "offline").length;
  const reportingWorkers = fieldWorkers.filter(e => e.submissions_today > 0).length;
  const reportingRate = fieldWorkers.length > 0
    ? Math.round((reportingWorkers / fieldWorkers.length) * 100)
    : 0;

  const totalSubs = dailySummary?.total_submissions || 0;

  const withSubs = fieldWorkers.filter(e => e.submissions_total > 0);
  const compliance = withSubs.length > 0
    ? Math.round(withSubs.reduce((s, e) => s + e.geofence_compliance, 0) / withSubs.length)
    : 100;

  const criticalAlerts = alerts.filter(a => a.severity === "critical").length;

  // Count unique states covered
  const statesCovered = new Set(enumerators.map(e => e.state).filter(Boolean)).size;

  const kpis = [
    {
      label: "Field Workers",
      value: fieldWorkers.length,
      subtitle: `${activeFieldWorkers} active · ${idleFieldWorkers} idle · ${offlineFieldWorkers} offline`,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Reporting Today",
      value: `${reportingRate}%`,
      subtitle: `${reportingWorkers} of ${fieldWorkers.length} reporting`,
      icon: Activity,
      color: reportingRate >= 70 ? "text-green-600" : reportingRate >= 40 ? "text-amber-600" : "text-destructive",
      bgColor: reportingRate >= 70 ? "bg-green-500/10" : reportingRate >= 40 ? "bg-amber-500/10" : "bg-destructive/10",
    },
    {
      label: t("supervisor.submissions_today"),
      value: totalSubs,
      subtitle: `Avg ${fieldWorkers.length > 0 ? (totalSubs / fieldWorkers.length).toFixed(1) : 0}/worker`,
      icon: TrendingUp,
      color: "text-acg-gold",
      bgColor: "bg-acg-gold/10",
    },
    {
      label: t("supervisor.geofence_compliance"),
      value: `${compliance}%`,
      subtitle: compliance >= 90 ? "Excellent" : compliance >= 70 ? t("supervisor.needs_attention") : "Critical",
      icon: ShieldCheck,
      color: compliance >= 90 ? "text-green-600" : compliance >= 70 ? "text-amber-600" : "text-destructive",
      bgColor: compliance >= 90 ? "bg-green-500/10" : compliance >= 70 ? "bg-amber-500/10" : "bg-destructive/10",
    },
    {
      label: t("supervisor.active_alerts"),
      value: alerts.length,
      subtitle: criticalAlerts > 0 ? `${criticalAlerts} critical` : t("supervisor.all_clear"),
      icon: AlertTriangle,
      color: criticalAlerts > 0 ? "text-destructive" : "text-muted-foreground",
      bgColor: criticalAlerts > 0 ? "bg-destructive/10" : "bg-muted",
    },
    {
      label: "States Covered",
      value: statesCovered,
      subtitle: `${enumerators.length} total users`,
      icon: MapPin,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="border-0 shadow-card">
          <CardContent className="p-3">
            <div className="flex items-start justify-between">
              <div className={`rounded-lg p-1.5 ${kpi.bgColor}`}>
                <kpi.icon className={`h-3.5 w-3.5 ${kpi.color}`} />
              </div>
            </div>
            <div className="mt-2">
              <p className="font-display text-xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-xs font-medium text-foreground">{kpi.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{kpi.subtitle}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default SupervisorKPICards;
