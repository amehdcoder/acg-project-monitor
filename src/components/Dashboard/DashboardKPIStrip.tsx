import { useState, useEffect, useCallback } from "react";
import { Send, Users, FolderOpen, MapPin, CheckCircle, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { extractLocationInfo, getStateFromGPS } from "@/lib/locationUtils";
import { NIGERIA_ADMIN_DATA } from "@/lib/nigeriaAdminData";
import KPIDrillDownSheet, { KPIDrillDownData, DrillDownItem } from "./KPIDrillDownSheet";

interface KPIData {
  totalSubmissions: number;
  todaySubmissions: number;
  syncRate: number;
  dataCollectors: number;
  activeProjects: number;
  pendingSync: number;
  lgasCovered: number;
  statesCovered: number;
  geofenceCompliance: number | null;
}

interface DetailData {
  submissionsByForm: Record<string, { formName: string; count: number; synced: number; pending: number }>;
  collectorsList: { name: string; email: string; count: number }[];
  projectsList: { name: string; forms: number; submissions: number }[];
  statesList: { state: string; submissions: number; lgas: string[] }[];
  geofenceByForm: { formName: string; total: number; compliant: number }[];
}

interface Props {
  onDataReady?: (data: KPIData) => void;
  selectedProjectId?: string | null;
}

const fetchAllSubmissions = async (selectColumns: string, filters?: { projectFormIds?: Set<string> }) => {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from("form_submissions")
      .select(selectColumns)
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) { hasMore = false; break; }
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) hasMore = false;
    else from += PAGE_SIZE;
  }
  if (filters?.projectFormIds) {
    allData = allData.filter((s: any) => filters.projectFormIds!.has(s.form_id));
  }
  return allData;
};

const DashboardKPIStrip = ({ onDataReady, selectedProjectId }: Props) => {
  const [data, setData] = useState<KPIData | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState<KPIDrillDownData | null>(null);

  const fetchKPIs = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch forms first to get project filter set
      const [geofenceFormsRes, profilesRes, formsRes, projectListRes] = await Promise.all([
        supabase.from("forms").select("id, name, geofence").not("geofence", "is", null),
        supabase.from("profiles").select("user_id, first_name, last_name, email, state, lga").not("state", "is", null),
        supabase.from("forms").select("id, name, questions, project_id"),
        supabase.from("projects").select("id, name").eq("status", "active"),
      ]);

      // Build form-to-project map and project filter
      const formProjectMap = new Map<string, string>();
      (formsRes.data || []).forEach((f: any) => { if (f.project_id) formProjectMap.set(f.id, f.project_id); });

      const projectFormIds = selectedProjectId
        ? new Set((formsRes.data || []).filter((f: any) => f.project_id === selectedProjectId).map((f: any) => f.id))
        : null;

      // Fetch ALL submissions with pagination
      const allSubs = await fetchAllSubmissions("user_id, form_id, data, location, within_geofence, status, synced_at, created_at", projectFormIds ? { projectFormIds } : undefined);

      // Count totals with project filter
      const totalSubs = allSubs.length;
      const synced = allSubs.filter((s: any) => s.status === "sent" && s.synced_at).length;
      const pending = allSubs.filter((s: any) => s.status === "draft" || !s.synced_at).length;
      const todaySubs = allSubs.filter((s: any) => new Date(s.created_at) >= today).length;
      const rate = totalSubs > 0 ? Math.round((synced / totalSubs) * 100) : 0;

      const activeProjectIds = selectedProjectId
        ? new Set([selectedProjectId])
        : new Set((projectListRes.data || []).map((p: any) => p.id));
      const activeProjectCount = selectedProjectId ? 1 : (projectListRes.data || []).length;

      const profileMap = new Map<string, { state: string | null; lga: string | null; name: string; email: string }>();
      (profilesRes.data || []).forEach((p: any) => {
        profileMap.set(p.user_id, {
          state: p.state?.trim() || null,
          lga: p.lga?.trim() || null,
          name: `${p.first_name} ${p.last_name}`,
          email: p.email,
        });
      });

      const formQuestionsMap = new Map<string, any[]>();
      const formNameMap = new Map<string, string>();
      (formsRes.data || []).forEach((f: any) => {
        if (f.questions && Array.isArray(f.questions)) formQuestionsMap.set(f.id, f.questions);
        formNameMap.set(f.id, f.name);
      });

      const projectNameMap = new Map<string, string>();
      (projectListRes.data || []).forEach((p: any) => projectNameMap.set(p.id, p.name));

      const geofenceFormsFiltered = selectedProjectId
        ? (geofenceFormsRes.data || []).filter((f: any) => {
            const pid = formProjectMap.get(f.id);
            return pid === selectedProjectId;
          })
        : (geofenceFormsRes.data || []);

      const hasGeofencedForms = geofenceFormsFiltered.some((f: any) => {
        const gf = f.geofence;
        if (!gf) return false;
        return gf.enabled === true || gf.type === "Polygon" || (Array.isArray(gf.coordinates) && gf.coordinates.length >= 3);
      });

      const geofencedFormIds = new Set(
        geofenceFormsFiltered.filter((f: any) => {
          const gf = f.geofence;
          return gf && (gf.enabled === true || gf.type === "Polygon" || (Array.isArray(gf.coordinates) && gf.coordinates.length >= 3));
        }).map((f: any) => f.id)
      );

      const geofenceFormNameMap = new Map<string, string>();
      geofenceFormsFiltered.forEach((f: any) => geofenceFormNameMap.set(f.id, f.name));

      const collectors = new Map<string, number>();
      const lgas = new Set<string>();
      const states = new Set<string>();
      let geoTotal = 0;
      let geoCompliant = 0;

      const subsByForm: Record<string, { formName: string; count: number; synced: number; pending: number }> = {};
      const stateSubsMap: Record<string, { count: number; lgaSet: Set<string> }> = {};
      const geoByForm: Record<string, { formName: string; total: number; compliant: number }> = {};

      const LGA_PATTERNS = ["lga", "local_government", "local_government_area", "area_council", "district", "local_govt", "localgovernment", "localgovt", "council", "county", "municipality"];
      const STATE_PATTERNS = ["state", "province", "region", "stato", "état"];

      allSubs.forEach((s: any) => {
        if (s.user_id) collectors.set(s.user_id, (collectors.get(s.user_id) || 0) + 1);

        const fName = formNameMap.get(s.form_id) || "Unknown";
        if (!subsByForm[s.form_id]) subsByForm[s.form_id] = { formName: fName, count: 0, synced: 0, pending: 0 };
        subsByForm[s.form_id].count++;
        if (s.status === "sent" && s.synced_at) subsByForm[s.form_id].synced++;
        if (s.status === "draft" || !s.synced_at) subsByForm[s.form_id].pending++;

        if (geofencedFormIds.has(s.form_id) && s.within_geofence !== null) {
          geoTotal++;
          if (s.within_geofence === true) geoCompliant++;
          const gfName = geofenceFormNameMap.get(s.form_id) || fName;
          if (!geoByForm[s.form_id]) geoByForm[s.form_id] = { formName: gfName, total: 0, compliant: 0 };
          geoByForm[s.form_id].total++;
          if (s.within_geofence === true) geoByForm[s.form_id].compliant++;
        }

        const d = s.data as Record<string, any>;
        let foundState: string | null = null;
        let foundLga: string | null = null;

        if (d && typeof d === "object") {
          const keys = Object.keys(d);
          const formQuestions = s.form_id ? formQuestionsMap.get(s.form_id) : null;
          if (formQuestions) {
            for (const q of formQuestions) {
              const qLabel = (q.label || q.title || "").toLowerCase();
              const qType = (q.type || "").toLowerCase();
              const qId = q.id || q.name || "";
              const val = d[qId];
              if (!val || typeof val !== "string" || !val.trim()) continue;
              if (!foundState && (qType === "state" || STATE_PATTERNS.some(p => qLabel.includes(p) || qId.toLowerCase().includes(p)))) foundState = val.trim();
              if (!foundLga && (qType === "lga" || LGA_PATTERNS.some(p => qLabel.includes(p) || qId.toLowerCase().includes(p)))) foundLga = val.trim();
              if (foundState && foundLga) break;
            }
          }
          if (!foundState || !foundLga) {
            for (const key of keys) {
              const lower = key.toLowerCase();
              const val = d[key];
              if (!val || typeof val !== "string" || !val.trim()) continue;
              if (!foundState && STATE_PATTERNS.some(p => lower.includes(p))) foundState = val.trim();
              if (!foundLga && LGA_PATTERNS.some(p => lower.includes(p))) foundLga = val.trim();
              if (foundState && foundLga) break;
            }
          }
          if (!foundState) {
            const locInfo = extractLocationInfo(d, s.location || null);
            if (locInfo.state) foundState = locInfo.state;
            if (!foundLga && locInfo.lga) foundLga = locInfo.lga;
          }
          if (!foundState && s.location) {
            const loc = s.location as Record<string, any>;
            const lat = Number(loc.lat || loc.latitude);
            const lng = Number(loc.lng || loc.longitude || loc.lon);
            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
              const gpsState = getStateFromGPS(lat, lng);
              if (gpsState) {
                foundState = gpsState;
                if (!foundLga) {
                  const stateData = Object.entries(NIGERIA_ADMIN_DATA).find(([s]) => s.toLowerCase() === gpsState.toLowerCase());
                  if (stateData) {
                    const lgaNames = Object.keys(stateData[1]);
                    if (lgaNames.length > 0) foundLga = lgaNames[0];
                  }
                }
              }
            }
          }
        }
        if (!foundState && s.user_id) { const profile = profileMap.get(s.user_id); if (profile?.state) foundState = profile.state; }
        if (!foundLga && s.user_id) { const profile = profileMap.get(s.user_id); if (profile?.lga) foundLga = profile.lga; }

        if (foundState) {
          const sKey = foundState.toLowerCase();
          states.add(sKey);
          if (!stateSubsMap[sKey]) stateSubsMap[sKey] = { count: 0, lgaSet: new Set() };
          stateSubsMap[sKey].count++;
          if (foundLga) {
            lgas.add(foundLga.toLowerCase());
            stateSubsMap[sKey].lgaSet.add(foundLga.toLowerCase());
          }
        }
        if (foundLga) lgas.add(foundLga.toLowerCase());
      });

      if (states.size > 0 && lgas.size === 0) {
        states.forEach((stateName) => {
          const match = Object.keys(NIGERIA_ADMIN_DATA).find((s) => s.toLowerCase() === stateName || s.toLowerCase().includes(stateName) || stateName.includes(s.toLowerCase()));
          if (match) {
            const profileLgas = new Set<string>();
            profileMap.forEach((profile) => {
              if (profile.state && profile.state.toLowerCase() === stateName && profile.lga) profileLgas.add(profile.lga.toLowerCase());
            });
            if (profileLgas.size > 0) profileLgas.forEach((l) => lgas.add(l));
            else { const lgaNames = Object.keys(NIGERIA_ADMIN_DATA[match]); if (lgaNames.length > 0) lgas.add(lgaNames[0].toLowerCase()); }
          }
        });
      }

      const geofenceCompliance = !hasGeofencedForms ? null : geoTotal > 0 ? Math.round((geoCompliant / geoTotal) * 100) : null;

      const collectorsList = Array.from(collectors.entries()).map(([uid, count]) => {
        const profile = profileMap.get(uid);
        return { name: profile?.name || uid.slice(0, 8), email: profile?.email || "", count };
      }).sort((a, b) => b.count - a.count);

      const projectStats: Record<string, { name: string; forms: Set<string>; subs: number }> = {};
      (formsRes.data || []).forEach((f: any) => {
        if (f.project_id && (!selectedProjectId || f.project_id === selectedProjectId)) {
          if (!projectStats[f.project_id]) projectStats[f.project_id] = { name: projectNameMap.get(f.project_id) || "Unknown", forms: new Set(), subs: 0 };
          projectStats[f.project_id].forms.add(f.id);
        }
      });
      allSubs.forEach((s: any) => {
        const pid = formProjectMap.get(s.form_id);
        if (pid && projectStats[pid]) projectStats[pid].subs++;
      });

      const projectsList = Object.values(projectStats).map(p => ({ name: p.name, forms: p.forms.size, submissions: p.subs })).sort((a, b) => b.submissions - a.submissions);
      const statesList = Object.entries(stateSubsMap).map(([state, d]) => ({
        state: state.charAt(0).toUpperCase() + state.slice(1),
        submissions: d.count,
        lgas: Array.from(d.lgaSet).map(l => l.charAt(0).toUpperCase() + l.slice(1)),
      })).sort((a, b) => b.submissions - a.submissions);

      const detailData: DetailData = {
        submissionsByForm: subsByForm,
        collectorsList,
        projectsList,
        statesList,
        geofenceByForm: Object.values(geoByForm).sort((a, b) => b.total - a.total),
      };

      const kpiData: KPIData = {
        totalSubmissions: totalSubs,
        todaySubmissions: todaySubs,
        syncRate: rate,
        dataCollectors: collectors.size,
        activeProjects: activeProjectCount,
        pendingSync: pending,
        lgasCovered: lgas.size,
        statesCovered: states.size,
        geofenceCompliance,
      };

      setData(kpiData);
      setDetail(detailData);
      onDataReady?.(kpiData);
    } catch (err) {
      console.error("KPI fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [onDataReady, selectedProjectId]);

  useEffect(() => {
    fetchKPIs();
    const channel = supabase
      .channel("dss-kpi-strip")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, fetchKPIs)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, fetchKPIs)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchKPIs]);

  const handleKPIClick = (kpiKey: string) => {
    if (!data || !detail) return;

    let drillData: KPIDrillDownData | null = null;

    switch (kpiKey) {
      case "totalSubmissions": {
        const items: DrillDownItem[] = Object.values(detail.submissionsByForm)
          .sort((a, b) => b.count - a.count)
          .map(f => ({ label: f.formName, value: f.count, extra: `${f.synced} synced · ${f.pending} pending` }));
        drillData = { kpiKey, title: "Total Submissions", total: data.totalSubmissions.toLocaleString(), subtitle: `+${data.todaySubmissions} today`, items };
        break;
      }
      case "syncRate": {
        const items: DrillDownItem[] = Object.values(detail.submissionsByForm)
          .filter(f => f.count > 0)
          .sort((a, b) => b.pending - a.pending)
          .map(f => ({ label: f.formName, value: f.synced, extra: `${f.pending} pending · ${f.count > 0 ? Math.round((f.synced / f.count) * 100) : 0}% synced` }));
        drillData = { kpiKey, title: "Sync Rate", total: `${data.syncRate}%`, subtitle: `${data.pendingSync} pending sync`, items };
        break;
      }
      case "dataCollectors": {
        const items: DrillDownItem[] = detail.collectorsList.map(c => ({ label: c.name, value: c.count, extra: c.email }));
        drillData = { kpiKey, title: "Data Collectors", total: data.dataCollectors.toLocaleString(), subtitle: "Unique submitters", items };
        break;
      }
      case "activeProjects": {
        const items: DrillDownItem[] = detail.projectsList.map(p => ({ label: p.name, value: p.submissions, extra: `${p.forms} forms` }));
        drillData = { kpiKey, title: "Active Projects", total: data.activeProjects.toLocaleString(), subtitle: "Currently running", items };
        break;
      }
      case "coverage": {
        const items: DrillDownItem[] = detail.statesList.map(s => ({ label: s.state, value: s.submissions, extra: `${s.lgas.length} LGA${s.lgas.length !== 1 ? "s" : ""}: ${s.lgas.slice(0, 3).join(", ")}${s.lgas.length > 3 ? "…" : ""}` }));
        drillData = { kpiKey, title: "Geographic Coverage", total: `${data.statesCovered} States · ${data.lgasCovered} LGAs`, subtitle: "From submissions & GPS", items };
        break;
      }
      case "geofenceCompliance": {
        const items: DrillDownItem[] = detail.geofenceByForm.map(f => ({
          label: f.formName, value: f.compliant,
          extra: `${f.total} total · ${f.total > 0 ? Math.round((f.compliant / f.total) * 100) : 0}% compliant`,
        }));
        drillData = {
          kpiKey, title: "Geofence Compliance",
          total: data.geofenceCompliance !== null ? `${data.geofenceCompliance}%` : "N/A",
          subtitle: data.geofenceCompliance === null ? "No geofenced forms" : "Submissions within boundaries",
          items,
        };
        break;
      }
    }

    setDrillDown(drillData);
  };

  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[82px] rounded-lg" />
        ))}
      </div>
    );
  }

  const kpis = [
    {
      key: "totalSubmissions",
      icon: Send, label: "Total Submissions", value: data.totalSubmissions.toLocaleString(),
      sub: `+${data.todaySubmissions} today`,
      accent: "from-[hsl(var(--kpi-submissions))] to-[hsl(var(--status-success-light))]",
      subColor: data.todaySubmissions > 0 ? "text-emerald-300" : "text-white/50",
    },
    {
      key: "syncRate",
      icon: CheckCircle, label: "Sync Rate", value: `${data.syncRate}%`,
      sub: `${data.pendingSync} pending`,
      accent: data.syncRate >= 80
        ? "from-[hsl(var(--status-success))] to-[hsl(var(--status-success-light))]"
        : data.syncRate >= 50
          ? "from-[hsl(var(--status-warning))] to-[hsl(var(--status-warning-light))]"
          : "from-[hsl(var(--status-danger))] to-[hsl(var(--status-danger-light))]",
      subColor: data.pendingSync > 0 ? "text-amber-300" : "text-white/50",
    },
    {
      key: "dataCollectors",
      icon: Users, label: "Data Collectors", value: data.dataCollectors.toLocaleString(),
      sub: "Unique submitters",
      accent: "from-[hsl(var(--kpi-collectors))] to-[hsl(var(--status-info-light))]",
      subColor: "text-white/50",
    },
    {
      key: "activeProjects",
      icon: FolderOpen, label: "Active Projects", value: data.activeProjects.toLocaleString(),
      sub: "Currently running",
      accent: "from-[hsl(var(--kpi-projects))] to-[hsl(var(--chart-accent)/0.7)]",
      subColor: "text-white/50",
    },
    {
      key: "coverage",
      icon: MapPin, label: "Coverage", value: `${data.statesCovered} States`,
      sub: `${data.lgasCovered} LGAs`,
      accent: "from-[hsl(var(--kpi-coverage))] to-[hsl(var(--kpi-coverage)/0.7)]",
      subColor: "text-teal-300",
    },
    {
      key: "geofenceCompliance",
      icon: Activity, label: "Geofence Compliance",
      value: data.geofenceCompliance === null ? "N/A" : `${data.geofenceCompliance}%`,
      sub: data.geofenceCompliance === null ? "No geofenced forms" : data.geofenceCompliance >= 90 ? "Excellent" : data.geofenceCompliance >= 70 ? "Needs attention" : "Critical",
      accent: data.geofenceCompliance === null
        ? "from-[hsl(var(--kpi-geofence))] to-[hsl(var(--kpi-geofence)/0.7)]"
        : data.geofenceCompliance >= 90
          ? "from-[hsl(var(--status-success))] to-[hsl(var(--status-success-light))]"
          : data.geofenceCompliance >= 70
            ? "from-[hsl(var(--status-warning))] to-[hsl(var(--status-warning-light))]"
            : "from-[hsl(var(--status-danger))] to-[hsl(var(--status-danger-light))]",
      subColor: data.geofenceCompliance === null ? "text-white/50" : data.geofenceCompliance >= 90 ? "text-emerald-300" : data.geofenceCompliance >= 70 ? "text-amber-300" : "text-red-300",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.key}
              onClick={() => handleKPIClick(kpi.key)}
              className={`relative rounded-lg bg-gradient-to-br ${kpi.accent} p-3 shadow-md border border-white/5 transition-all hover:scale-[1.03] hover:shadow-lg cursor-pointer group`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] sm:text-[10px] font-semibold text-white/70 uppercase tracking-widest leading-none truncate">
                  {kpi.label}
                </p>
                <Icon className="h-3.5 w-3.5 text-white/40 shrink-0 group-hover:text-white/70 transition-colors" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white leading-tight tracking-tight">
                {kpi.value}
              </p>
              <p className={`text-[9px] sm:text-[10px] font-medium mt-0.5 ${kpi.subColor}`}>
                {kpi.sub}
              </p>
              {/* Click hint */}
              <div className="absolute inset-0 rounded-lg border-2 border-white/0 group-hover:border-white/20 transition-all pointer-events-none" />
            </div>
          );
        })}
      </div>

      <KPIDrillDownSheet data={drillDown} onClose={() => setDrillDown(null)} />
    </>
  );
};

export default DashboardKPIStrip;
