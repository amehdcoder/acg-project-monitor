import { AlertTriangle, X, ShieldAlert, Clock, TrendingDown, MapPinOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SupervisorAlert } from "@/hooks/useSupervisorDashboard";
import { useLanguage } from "@/hooks/useLanguage";
import { formatDistanceToNow } from "date-fns";

interface Props {
  alerts: SupervisorAlert[];
  onDismiss: (alertId: string) => void;
}

const ALERT_ICONS = {
  no_activity: Clock,
  low_submissions: TrendingDown,
  geofence_violation: MapPinOff,
  late_start: Clock,
  unusual_pattern: ShieldAlert,
};

const SupervisorAlerts = ({ alerts, onDismiss }: Props) => {
  const { t } = useLanguage();
  const critical = alerts.filter(a => a.severity === "critical");
  const warnings = alerts.filter(a => a.severity === "warning");

  if (alerts.length === 0) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
            <ShieldAlert className="h-6 w-6 text-green-600" />
          </div>
          <p className="font-medium text-foreground">{t("supervisor.all_clear")}</p>
          <p className="text-sm text-muted-foreground mt-1">No active alerts at this time</p>
        </CardContent>
      </Card>
    );
  }

  const renderAlert = (alert: SupervisorAlert) => {
    const Icon = ALERT_ICONS[alert.type] || AlertTriangle;
    const isCritical = alert.severity === "critical";

    return (
      <div
        key={alert.id}
        className={`flex items-start gap-3 rounded-lg p-3 ${
          isCritical ? "bg-destructive/10 border border-destructive/20" : "bg-amber-500/10 border border-amber-500/20"
        }`}
      >
        <div className={`mt-0.5 rounded-full p-1.5 ${isCritical ? "bg-destructive/20" : "bg-amber-500/20"}`}>
          <Icon className={`h-3.5 w-3.5 ${isCritical ? "text-destructive" : "text-amber-600"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium text-foreground truncate">{alert.user_name}</p>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-4 ${
                isCritical ? "border-destructive/30 text-destructive" : "border-amber-500/30 text-amber-700"
              }`}
            >
              {isCritical ? "Critical" : "Warning"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{alert.message}</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => onDismiss(alert.id)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Alerts
            <Badge variant="secondary" className="ml-1">{alerts.length}</Badge>
          </CardTitle>
          {alerts.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => alerts.forEach(a => onDismiss(a.id))}
            >
              Dismiss All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2">
            {critical.map(renderAlert)}
            {warnings.map(renderAlert)}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default SupervisorAlerts;
