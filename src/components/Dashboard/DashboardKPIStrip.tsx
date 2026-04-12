import { useState, useEffect } from "react";
import { 
  Send, Users, FolderOpen, Clock, MapPin, CheckCircle, TrendingUp, TrendingDown, Minus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface KPIData {
  totalSubmissions: number;
  syncRate: number;
  dataCollectors: number;
  activeProjects: number;
  pendingSync: number;
  lgasCovered: number;
  // deltas
  submissionsDelta: number;
  collectorsDelta: number;
  projectsDelta: number;
  lgasDelta: number;
}

const DeltaIndicator = ({ delta }: { delta: number }) => {
  if (delta > 0) return (
    <span className="flex items-center gap-0.5 text-[9px] text-emerald-400 font-medium">
      <TrendingUp className="h-2.5 w-2.5" /> +{delta}
    </span>
  );
  if (delta < 0) return (
    <span className="flex items-center gap-0.5 text-[9px] text-red-400 font-medium">
      <TrendingDown className="h-2.5 w-2.5" /> {delta}
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground/60 font-medium">
      <Minus className="h-2.5 w-2.5" /> 0
    </span>
  );
};

const KPICard = ({ 
  icon: Icon, label, value, color, delta, suffix 
}: { 
  icon: any; label: string; value: number | string; color: string; delta?: number; suffix?: string;
}) => (
  <div className={`relative overflow-hidden rounded-xl p-3 sm:p-4 ${color} shadow-lg border border-white/10`}>
    <div className="flex items-start justify-between">
      <div>
        <div className="flex items-center gap-1.5">
          <span className="text-2xl sm:text-3xl font-bold text-white font-display">
            {typeof value === "number" ? value.toLocaleString() : value}
            {suffix && <span className="text-lg ml-0.5">{suffix}</span>}
          </span>
        </div>
        {delta !== undefined && <DeltaIndicator delta={delta} />}
      </div>
      <Icon className="h-5 w-5 text-white/60" />
    </div>
    <p className="text-[10px] sm:text-xs font-semibold text-white/80 uppercase tracking-wider mt-1">{label}</p>
  </div>
);

interface Props {
  onDataReady?: (data: KPIData) => void;
}

const DashboardKPIStrip = ({ onDataReady }: Props) => {
  const [data, setData] = useState<KPIData>({
    totalSubmissions: 0, syncRate: 0, activeUsers: 0, activeProjects: 0,
    pendingSync: 0, statesCovered: 0, submissionsDelta: 0, usersDelta: 0,
    projectsDelta: 0, statesDelta: 0,
  });

  const fetchKPIs = async () => {
    try {
      const [subsRes, syncedRes, pendingRes, usersRes, projectsRes, formsSubsRes] = await Promise.all([
        supabase.from("form_submissions").select("*", { count: "exact", head: true }),
        supabase.from("form_submissions").select("*", { count: "exact", head: true }).eq("status", "sent").not("synced_at", "is", null),
        supabase.from("form_submissions").select("*", { count: "exact", head: true }).or("status.eq.draft,synced_at.is.null"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("projects").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("form_submissions").select("data").limit(1000),
      ]);

      const totalSubs = subsRes.count || 0;
      const synced = syncedRes.count || 0;
      const pending = pendingRes.count || 0;
      const rate = totalSubs > 0 ? Math.round((synced / totalSubs) * 100) : 0;

      // Extract states from submissions
      const states = new Set<string>();
      (formsSubsRes.data || []).forEach((s: any) => {
        const d = s.data as Record<string, any>;
        if (!d) return;
        const stateVal = d.state || d.State || d.location_state || d.admin_state;
        if (typeof stateVal === "string" && stateVal.trim()) states.add(stateVal.trim().toLowerCase());
      });

      // Calculate deltas (today vs yesterday)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: todaySubs } = await supabase.from("form_submissions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString());

      const kpiData: KPIData = {
        totalSubmissions: totalSubs,
        syncRate: rate,
        activeUsers: usersRes.count || 0,
        activeProjects: projectsRes.count || 0,
        pendingSync: pending,
        statesCovered: states.size,
        submissionsDelta: todaySubs || 0,
        usersDelta: 0,
        projectsDelta: 0,
        statesDelta: 0,
      };

      setData(kpiData);
      onDataReady?.(kpiData);
    } catch (err) {
      console.error("KPI fetch error:", err);
    }
  };

  useEffect(() => {
    fetchKPIs();
    const channel = supabase
      .channel("dss-kpi-strip")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, fetchKPIs)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, fetchKPIs)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      <KPICard icon={Send} label="Total Submissions" value={data.totalSubmissions} color="bg-gradient-to-br from-emerald-600 to-emerald-800" delta={data.submissionsDelta} />
      <KPICard icon={CheckCircle} label="Sync Rate" value={data.syncRate} suffix="%" color={data.syncRate >= 80 ? "bg-gradient-to-br from-emerald-500 to-emerald-700" : data.syncRate >= 50 ? "bg-gradient-to-br from-amber-500 to-amber-700" : "bg-gradient-to-br from-red-500 to-red-700"} />
      <KPICard icon={Users} label="Active Users" value={data.activeUsers} color="bg-gradient-to-br from-sky-600 to-sky-800" />
      <KPICard icon={FolderOpen} label="Active Projects" value={data.activeProjects} color="bg-gradient-to-br from-violet-600 to-violet-800" />
      <KPICard icon={Clock} label="Pending Sync" value={data.pendingSync} color={data.pendingSync > 0 ? "bg-gradient-to-br from-amber-500 to-amber-700" : "bg-gradient-to-br from-slate-600 to-slate-800"} />
      <KPICard icon={MapPin} label="States Covered" value={data.statesCovered} color="bg-gradient-to-br from-teal-600 to-teal-800" delta={data.statesDelta} />
    </div>
  );
};

export default DashboardKPIStrip;
