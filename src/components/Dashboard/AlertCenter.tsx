import { useState, useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, TrendingDown, MapPin, Shield, Activity, CheckCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Alert {
  id: string;
  icon: "anomaly" | "drop" | "cluster" | "geo" | "activity";
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  timestamp: string;
}

const iconMap = {
  anomaly: AlertTriangle,
  drop: TrendingDown,
  cluster: MapPin,
  geo: Shield,
  activity: Activity,
};

const severityStyle = {
  critical: "text-status-danger bg-status-danger/10 border-status-danger/20",
  warning: "text-status-warning bg-status-warning/10 border-status-warning/20",
  info: "text-status-info bg-status-info/10 border-status-info/20",
};

interface AlertCenterProps {
  selectedProjectId?: string | null;
}

const AlertCenter = ({ selectedProjectId }: AlertCenterProps) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const alertRef = useRef(generateAlerts);
  useEffect(() => { alertRef.current = generateAlerts; });

  useEffect(() => {
    alertRef.current();
    const channel = supabase
      .channel("dss-alert-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, () => alertRef.current())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedProjectId]);


  const generateAlerts = async () => {
    try {
      // Fetch forms to enable project filter and question-schema lookup
      let formIds: string[] | null = null;
      let formQuestionsMap = new Map<string, any[]>();
      const { data: formsData } = await supabase.from("forms").select("id, project_id, questions");
      if (formsData) {
        formsData.forEach((f: any) => {
          if (f.questions && Array.isArray(f.questions)) formQuestionsMap.set(f.id, f.questions);
        });
      }
      if (selectedProjectId) {
        formIds = (formsData || []).filter((f: any) => f.project_id === selectedProjectId).map((f: any) => f.id);
        if (formIds.length === 0) { setAlerts([]); setLoading(false); return; }
      }

      // Use a 60-day window — alerts are operational/recent, no need for all-time data
      const since60 = new Date(Date.now() - 60 * 86400000).toISOString();
      let query = supabase
        .from("form_submissions")
        .select("data, within_geofence, created_at, user_id, form_id")
        .gte("created_at", since60)
        .order("created_at", { ascending: false });
      if (formIds) query = query.in("form_id", formIds);
      const { data: submissions } = await query;

      if (!submissions) { setLoading(false); return; }

      const generatedAlerts: Alert[] = [];
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);

      // Robust location extraction (matches RiskAssessmentWidget priority order)
      const STATE_PATTERNS = ["state", "province", "region"];
      const LGA_PATTERNS = ["lga", "local_government", "local_government_area", "area_council", "district", "local_govt", "council", "county", "municipality"];

      const extractLocation = (s: any): string | null => {
        const d = (s.data || {}) as Record<string, any>;
        // (1) Form-schema-aware extraction
        const formQuestions = s.form_id ? formQuestionsMap.get(s.form_id) : null;
        if (formQuestions && d && typeof d === "object") {
          for (const q of formQuestions) {
            const qLabel = (q.label || q.title || "").toLowerCase();
            const qType = (q.type || "").toLowerCase();
            const qId = q.id || q.name || "";
            const val = d[qId];
            if (!val || typeof val !== "string" || !val.trim()) continue;
            if (qType === "lga" || LGA_PATTERNS.some(p => qLabel.includes(p) || qId.toLowerCase().includes(p))) return val.trim();
          }
          for (const q of formQuestions) {
            const qLabel = (q.label || q.title || "").toLowerCase();
            const qType = (q.type || "").toLowerCase();
            const qId = q.id || q.name || "";
            const val = d[qId];
            if (!val || typeof val !== "string" || !val.trim()) continue;
            if (qType === "state" || STATE_PATTERNS.some(p => qLabel.includes(p) || qId.toLowerCase().includes(p))) return val.trim();
          }
        }
        // (2) Generic key pattern fallback
        if (d && typeof d === "object") {
          for (const key of Object.keys(d)) {
            const lower = key.toLowerCase();
            const val = d[key];
            if (!val || typeof val !== "string" || !val.trim()) continue;
            if (LGA_PATTERNS.some(p => lower.includes(p))) return val.trim();
          }
          for (const key of Object.keys(d)) {
            const lower = key.toLowerCase();
            const val = d[key];
            if (!val || typeof val !== "string" || !val.trim()) continue;
            if (STATE_PATTERNS.some(p => lower.includes(p))) return val.trim();
          }
        }
        return null;
      };

      // Geofence anomalies
      const violations = submissions.filter((s: any) => s.within_geofence === false);
      if (violations.length > submissions.length * 0.3 && violations.length > 5) {
        const pct = Math.round((violations.length / submissions.length) * 100);
        generatedAlerts.push({
          id: "geo-anomaly",
          icon: "anomaly",
          title: "Geofence Anomalies Detected",
          description: `${pct}% of submissions (${violations.length}) are outside designated areas`,
          severity: "critical",
          timestamp: new Date().toISOString(),
        });
      }

      // Reporting drops by location
      const locationCounts: Record<string, { recent: number; all: number }> = {};
      submissions.forEach((s: any) => {
        const loc = extractLocation(s);
        if (!loc) return;
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
            title: `No Reports from ${loc}`,
            description: `${counts.all} submissions in last 60 days but zero in the past 7 days`,
            severity: "warning",
            timestamp: now.toISOString(),
          });
        }
      });

      // Clustered submissions
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
          title: `Suspicious Clustering (${clusterUsers.length} users)`,
          description: `${clusterUsers.length} user(s) submitted 50+ entries this week — verify data integrity`,
          severity: "warning",
          timestamp: now.toISOString(),
        });
      }

      // Missing geo evidence
      const noGeo = submissions.filter((s: any) => s.within_geofence === null).length;
      if (noGeo > submissions.length * 0.4 && noGeo > 10) {
        generatedAlerts.push({
          id: "missing-geo",
          icon: "geo",
          title: "Missing Geo-Evidence",
          description: `${noGeo} submissions (${Math.round((noGeo / submissions.length) * 100)}%) lack geofence verification`,
          severity: "info",
          timestamp: now.toISOString(),
        });
      }

      setAlerts(generatedAlerts.slice(0, 5));
    } catch (err) {
      console.error("Alert center error:", err);
    } finally {
      setLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm sm:text-base flex items-center gap-2 font-semibold text-foreground">
          <AlertTriangle className="h-4 w-4 text-status-warning" />
          Alert Center
        </h3>
        {alerts.length > 0 && (
          <Badge variant="outline" className="text-[9px] h-5 border-status-warning/50 text-status-warning">
            {alerts.length}
          </Badge>
        )}
      </div>
      <div className="space-y-2">
        {alerts.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground flex flex-col items-center gap-2">
            <CheckCircle className="h-8 w-8 text-status-success opacity-40" />
            <p className="font-medium">All Clear</p>
            <p className="text-[10px]">No active alerts — system is operating normally</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const Icon = iconMap[alert.icon];
            return (
              <div key={alert.id} className={`flex items-start gap-2.5 rounded-lg p-3 border transition-colors ${severityStyle[alert.severity]}`}>
                <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold block">{alert.title}</span>
                  <span className="text-[10px] opacity-80 block mt-0.5">{alert.description}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AlertCenter;
