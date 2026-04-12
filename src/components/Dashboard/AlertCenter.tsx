import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, TrendingDown, MapPin, Shield, Eye, Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Alert {
  id: string;
  icon: "anomaly" | "drop" | "cluster" | "geo" | "activity";
  title: string;
  severity: "critical" | "warning" | "info";
}

const iconMap = {
  anomaly: AlertTriangle,
  drop: TrendingDown,
  cluster: MapPin,
  geo: Shield,
  activity: Activity,
};

const severityColor = {
  critical: "text-red-500",
  warning: "text-amber-500",
  info: "text-sky-500",
};

const AlertCenter = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    generateAlerts();
    const channel = supabase
      .channel("dss-alert-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, generateAlerts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const generateAlerts = async () => {
    try {
      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("data, within_geofence, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!submissions) return;

      const generatedAlerts: Alert[] = [];
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);

      // Check for geofence anomalies
      const violations = submissions.filter((s: any) => s.within_geofence === false);
      if (violations.length > submissions.length * 0.3 && violations.length > 5) {
        generatedAlerts.push({
          id: "geo-anomaly",
          icon: "anomaly",
          title: "Detected Anomalies",
          severity: "critical",
        });
      }

      // Check for reporting drops in locations
      const locationCounts: Record<string, { recent: number; all: number }> = {};
      submissions.forEach((s: any) => {
        const d = s.data as Record<string, any>;
        const loc = d?.lga || d?.LGA || d?.state || d?.State;
        if (typeof loc !== "string") return;
        const key = loc.trim();
        if (!locationCounts[key]) locationCounts[key] = { recent: 0, all: 0 };
        locationCounts[key].all++;
        if (new Date(s.created_at) >= weekAgo) locationCounts[key].recent++;
      });

      Object.entries(locationCounts).forEach(([loc, counts]) => {
        if (counts.all > 10 && counts.recent === 0) {
          generatedAlerts.push({
            id: `drop-${loc}`,
            icon: "drop",
            title: `Report Drop in ${loc}`,
            severity: "warning",
          });
        }
      });

      // Check for clustered submissions (same user, many in short time)
      const userRecent: Record<string, number> = {};
      submissions.forEach((s: any) => {
        if (new Date(s.created_at) >= weekAgo) {
          userRecent[s.user_id] = (userRecent[s.user_id] || 0) + 1;
        }
      });
      const clusterUsers = Object.entries(userRecent).filter(([_, c]) => c > 50);
      if (clusterUsers.length > 0) {
        generatedAlerts.push({
          id: "cluster",
          icon: "cluster",
          title: `Clustered Submissions (${clusterUsers.length} users)`,
          severity: "warning",
        });
      }

      // Check for missing geo evidence
      const noGeo = submissions.filter((s: any) => s.within_geofence === null).length;
      if (noGeo > submissions.length * 0.4 && noGeo > 10) {
        generatedAlerts.push({
          id: "missing-geo",
          icon: "geo",
          title: "Missing Geo-Evidence in Submissions",
          severity: "info",
        });
      }

      setAlerts(generatedAlerts.slice(0, 5));
    } catch (err) {
      console.error("Alert center error:", err);
    }
  };

  return (
    <Card className="border border-border/30 shadow-card bg-card/95 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-sm sm:text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Alert Center
          </CardTitle>
          {alerts.length > 0 && (
            <Badge variant="outline" className="text-[9px] h-5 border-amber-500/50 text-amber-600">
              {alerts.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground">
            <Shield className="h-6 w-6 mx-auto mb-1 opacity-40" />
            No active alerts
          </div>
        ) : (
          alerts.map((alert) => {
            const Icon = iconMap[alert.icon];
            return (
              <div key={alert.id} className="flex items-center gap-2.5 rounded-lg p-2.5 bg-muted/40 hover:bg-muted/60 transition-colors">
                <Icon className={`h-4 w-4 flex-shrink-0 ${severityColor[alert.severity]}`} />
                <span className="text-xs font-medium text-foreground truncate">{alert.title}</span>
              </div>
            );
          })
        )}

        {alerts.length > 0 && (
          <div className="pt-2 border-t border-border/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="font-medium">Action Tracker</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AlertCenter;
