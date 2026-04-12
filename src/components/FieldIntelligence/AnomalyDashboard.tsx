import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Clock, Smartphone, Zap, Loader2, RefreshCw, User } from "lucide-react";
import { useDigitalFingerprint } from "@/hooks/useDigitalFingerprint";

interface Props {
  projectId: string;
}

const severityColors: Record<string, string> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

const typeIcons: Record<string, React.ReactNode> = {
  unusual_login_time: <Clock className="h-4 w-4 text-status-warning" />,
  rapid_submissions: <Zap className="h-4 w-4 text-destructive" />,
  new_device: <Smartphone className="h-4 w-4 text-chart-primary" />,
  suspicious_location: <AlertTriangle className="h-4 w-4 text-destructive" />,
  unusual_data_access: <Shield className="h-4 w-4 text-primary" />,
};

const AnomalyDashboard = ({ projectId }: Props) => {
  const { anomalies, isAnalyzing, runAnomalyCheck } = useDigitalFingerprint(!!projectId);

  const highCount = anomalies.filter(a => a.severity === "high").length;
  const medCount = anomalies.filter(a => a.severity === "medium").length;
  const lowCount = anomalies.filter(a => a.severity === "low").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-destructive/10"><AlertTriangle className="h-4 w-4 text-destructive" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Critical Alerts</p>
              <p className="text-xl font-bold text-destructive">{highCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-status-warning/10"><Clock className="h-4 w-4 text-status-warning" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Warnings</p>
              <p className="text-xl font-bold text-status-warning">{medCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-chart-primary/10"><Shield className="h-4 w-4 text-chart-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Info</p>
              <p className="text-xl font-bold text-chart-primary">{lowCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10"><User className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Users Flagged</p>
              <p className="text-xl font-bold">{new Set(anomalies.map(a => a.userId)).size}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Digital Fingerprint Anomalies</h3>
          <p className="text-sm text-muted-foreground">
            Behavioral analysis detects unusual login times, rapid submissions, and new devices
          </p>
        </div>
        <Button onClick={runAnomalyCheck} disabled={isAnalyzing} variant="outline" className="gap-2">
          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Scan Now
        </Button>
      </div>

      {anomalies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
          <Shield className="h-12 w-12 text-status-success mx-auto mb-3" />
            <p className="text-lg font-semibold text-status-success">All Clear</p>
            <p className="text-sm text-muted-foreground mt-1">
              {projectId
                ? "No behavioral anomalies detected. Fingerprint analysis is running in the background."
                : "Select a project to begin anomaly detection."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {anomalies.map((alert, i) => (
            <Card key={i} className={`border-l-4 ${
              alert.severity === "high" ? "border-l-destructive" :
              alert.severity === "medium" ? "border-l-status-warning" : "border-l-chart-primary"
            }`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {typeIcons[alert.type] || <AlertTriangle className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{alert.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
                      <Badge variant={severityColors[alert.severity] as any} className="text-[10px]">
                        {alert.severity.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {alert.timestamp ? new Date(alert.timestamp).toLocaleString() : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnomalyDashboard;
