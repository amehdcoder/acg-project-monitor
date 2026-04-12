import { useState, useEffect, useCallback } from "react";
import { 
  Send, Users, FolderOpen, Clock, MapPin, CheckCircle, TrendingUp, TrendingDown, Minus, Activity
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface KPIData {
  totalSubmissions: number;
  todaySubmissions: number;
  syncRate: number;
  dataCollectors: number;
  activeProjects: number;
  pendingSync: number;
  lgasCovered: number;
  statesCovered: number;
  geofenceCompliance: number;
}

interface Props {
  onDataReady?: (data: KPIData) => void;
}

const DashboardKPIStrip = ({ onDataReady }: Props) => {
  const [data, setData] = useState<KPIData>({
    totalSubmissions: 0, todaySubmissions: 0, syncRate: 0, dataCollectors: 0,
    activeProjects: 0, pendingSync: 0, lgasCovered: 0, statesCovered: 0,
    geofenceCompliance: 0,
  });

  const fetchKPIs = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [subsRes, syncedRes, pendingRes, projectsRes, todayRes, detailRes] = await Promise.all([
        supabase.from("form_submissions").select("*", { count: "exact", head: true }),
        supabase.from("form_submissions").select("*", { count: "exact", head: true }).eq("status", "sent").not("synced_at", "is", null),
        supabase.from("form_submissions").select("*", { count: "exact", head: true }).or("status.eq.draft,synced_at.is.null"),
        supabase.from("projects").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("form_submissions").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString()),
        supabase.from("form_submissions").select("user_id, data, within_geofence").limit(1000),
        supabase.from("forms").select("id, geofence").not("geofence", "is", null),
      ]);

      const totalSubs = subsRes.count || 0;
      const synced = syncedRes.count || 0;
      const pending = pendingRes.count || 0;
      const rate = totalSubs > 0 ? Math.round((synced / totalSubs) * 100) : 0;

      const collectors = new Set<string>();
      const lgas = new Set<string>();
      const states = new Set<string>();
      let geoTotal = 0;
      let geoCompliant = 0;

      (detailRes.data || []).forEach((s: any) => {
        if (s.user_id) collectors.add(s.user_id);
        if (s.within_geofence !== null) {
          geoTotal++;
          if (s.within_geofence === true) geoCompliant++;
        }
        const d = s.data as Record<string, any>;
        if (!d) return;
        const lgaVal = d.lga || d.LGA || d.local_government || d.district;
        if (typeof lgaVal === "string" && lgaVal.trim()) lgas.add(lgaVal.trim().toLowerCase());
        const stateVal = d.state || d.State || d.location_state || d.admin_state;
        if (typeof stateVal === "string" && stateVal.trim()) states.add(stateVal.trim().toLowerCase());
      });

      const kpiData: KPIData = {
        totalSubmissions: totalSubs,
        todaySubmissions: todayRes.count || 0,
        syncRate: rate,
        dataCollectors: collectors.size,
        activeProjects: projectsRes.count || 0,
        pendingSync: pending,
        lgasCovered: lgas.size,
        statesCovered: states.size,
        geofenceCompliance: geoTotal > 0 ? Math.round((geoCompliant / geoTotal) * 100) : 100,
      };

      setData(kpiData);
      onDataReady?.(kpiData);
    } catch (err) {
      console.error("KPI fetch error:", err);
    }
  }, [onDataReady]);

  useEffect(() => {
    fetchKPIs();
    const channel = supabase
      .channel("dss-kpi-strip")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, fetchKPIs)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, fetchKPIs)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchKPIs]);

  const kpis = [
    {
      icon: Send, label: "Total Submissions", value: data.totalSubmissions.toLocaleString(),
      sub: `+${data.todaySubmissions} today`,
      accent: "from-[hsl(160,50%,35%)] to-[hsl(160,60%,25%)]",
      subColor: data.todaySubmissions > 0 ? "text-emerald-300" : "text-white/50",
    },
    {
      icon: CheckCircle, label: "Sync Rate", value: `${data.syncRate}%`,
      sub: `${data.pendingSync} pending`,
      accent: data.syncRate >= 80
        ? "from-[hsl(160,50%,35%)] to-[hsl(160,60%,25%)]"
        : data.syncRate >= 50
          ? "from-[hsl(38,80%,45%)] to-[hsl(30,70%,35%)]"
          : "from-[hsl(0,65%,45%)] to-[hsl(0,55%,35%)]",
      subColor: data.pendingSync > 0 ? "text-amber-300" : "text-white/50",
    },
    {
      icon: Users, label: "Data Collectors", value: data.dataCollectors.toLocaleString(),
      sub: "Unique submitters",
      accent: "from-[hsl(210,60%,40%)] to-[hsl(220,55%,30%)]",
      subColor: "text-white/50",
    },
    {
      icon: FolderOpen, label: "Active Projects", value: data.activeProjects.toLocaleString(),
      sub: "Currently running",
      accent: "from-[hsl(265,50%,45%)] to-[hsl(265,45%,33%)]",
      subColor: "text-white/50",
    },
    {
      icon: MapPin, label: "Coverage", value: `${data.statesCovered} States`,
      sub: `${data.lgasCovered} LGAs`,
      accent: "from-[hsl(180,45%,35%)] to-[hsl(180,50%,25%)]",
      subColor: "text-teal-300",
    },
    {
      icon: Activity, label: "Geofence Compliance", value: `${data.geofenceCompliance}%`,
      sub: data.geofenceCompliance >= 90 ? "Excellent" : data.geofenceCompliance >= 70 ? "Needs attention" : "Critical",
      accent: data.geofenceCompliance >= 90
        ? "from-[hsl(160,50%,35%)] to-[hsl(160,60%,25%)]"
        : data.geofenceCompliance >= 70
          ? "from-[hsl(38,80%,45%)] to-[hsl(30,70%,35%)]"
          : "from-[hsl(0,65%,45%)] to-[hsl(0,55%,35%)]",
      subColor: data.geofenceCompliance >= 90 ? "text-emerald-300" : data.geofenceCompliance >= 70 ? "text-amber-300" : "text-red-300",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div
            key={kpi.label}
            className={`relative rounded-lg bg-gradient-to-br ${kpi.accent} p-3 shadow-md border border-white/5 transition-transform hover:scale-[1.02]`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] sm:text-[10px] font-semibold text-white/70 uppercase tracking-widest leading-none truncate">
                {kpi.label}
              </p>
              <Icon className="h-3.5 w-3.5 text-white/40 shrink-0" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-white leading-tight tracking-tight">
              {kpi.value}
            </p>
            <p className={`text-[9px] sm:text-[10px] font-medium mt-0.5 ${kpi.subColor}`}>
              {kpi.sub}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default DashboardKPIStrip;
