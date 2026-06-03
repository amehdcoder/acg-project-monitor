import { useState, useEffect, useCallback } from "react";
import { Send, Users, FolderOpen, MapPin, CheckCircle, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { extractLocationInfo, getStateFromGPS, normalizeStateName } from "@/lib/locationUtils";
import { NIGERIA_ADMIN_DATA } from "@/lib/nigeriaAdminData";
import KPIDrillDownSheet, { KPIDrillDownData, DrillDownItem } from "./KPIDrillDownSheet";
import KPIPrimaryDataDialog, { KPIPrimaryRequest, KPIPrimaryKind } from "./KPIPrimaryDataDialog";

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
  isSyncing?: boolean;
}


const fetchAllSubmissions = async (selectColumns: string, filters?: { projectFormIds?: Set<string> }) => {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  
  // Use a 90-day window for the KPI strip to keep it fast while showing recent project history
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString();

  while (true) {
    let query = supabase
      .from("form_submissions")
      .select(selectColumns)
      .gte("created_at", since90)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
      
    if (filters?.projectFormIds) {
      query = query.in("form_id", Array.from(filters.projectFormIds));
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) break;
    
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allData;
};


const DashboardKPIStrip = ({ onDataReady, selectedProjectId, isSyncing }: Props) => {

  const [data, setData] = useState<KPIData | null>(() => {
    const cached = localStorage.getItem(`kpi_cache_${selectedProjectId || 'global'}`);
    return cached ? JSON.parse(cached) : null;
  });
  const [detail, setDetail] = useState<DetailData | null>(() => {
    const cached = localStorage.getItem(`detail_cache_${selectedProjectId || 'global'}`);
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(!data);
  const [drillDown, setDrillDown] = useState<KPIDrillDownData | null>(null);
  const [primaryRequest, setPrimaryRequest] = useState<KPIPrimaryRequest | null>(null);


  const fetchKPIs = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch forms first to get project filter set
      const [geofenceFormsRes, profilesRes, formsRes, projectListRes] = await Promise.all([
        supabase.from("forms").select("id, name, geofence").not("geofence", "is", null),
        supabase.from("profiles").select("user_id, first_name, last_name, email, state, lga"),

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

      // Count totals with project filter.
      // Synced vs pending must be MUTUALLY EXCLUSIVE & EXHAUSTIVE so the rate is
      // always trustworthy: a submission is "synced" iff it carries a synced_at
      // timestamp (server-confirmed), otherwise it is "pending". This avoids the
      // earlier gap where a `finalized` row with synced_at counted as neither.
      const totalSubs = allSubs.length;
      const synced = allSubs.filter((s: any) => !!s.synced_at).length;
      const pending = totalSubs - synced;
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
        if (s.synced_at) subsByForm[s.form_id].synced++;
        else subsByForm[s.form_id].pending++;

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
          // Canonicalise so "lagos state", "Lagos", "LAGOS" all bucket together
          // — and crucially, so this widget agrees with RiskAssessmentWidget
          // (which now uses the same normaliser).
          const canonical = normalizeStateName(foundState) || foundState.trim();
          const sKey = canonical;
          states.add(sKey);
          if (!stateSubsMap[sKey]) stateSubsMap[sKey] = { count: 0, lgaSet: new Set() };
          stateSubsMap[sKey].count++;
          if (foundLga) {
            const lgaKey = foundLga.trim();
            lgas.add(lgaKey.toLowerCase());
            stateSubsMap[sKey].lgaSet.add(lgaKey);
          }
        } else if (foundLga) {
          lgas.add(foundLga.trim().toLowerCase());
        }
      });

      // ─── Per-state LGA back-fill ──────────────────────────────────
      // If a state was reported but the submission carried no LGA value,
      // back-fill the per-state lgaSet from (1) profiles whose state matches,
      // then (2) the canonical NIGERIA_ADMIN_DATA registry. Without this,
      // the Coverage drill-down for that state shows "0 LGAs" even though
      // the global LGA counter (used by the KPI tile) inferred one.
      Object.keys(stateSubsMap).forEach((stateKey) => {
        if (stateSubsMap[stateKey].lgaSet.size > 0) return;
        // (1) Profile-based back-fill
        profileMap.forEach((profile) => {
          if (!profile.state || !profile.lga) return;
          const pCanonical = normalizeStateName(profile.state) || profile.state;
          if (pCanonical === stateKey) stateSubsMap[stateKey].lgaSet.add(profile.lga.trim());
        });
        // (2) Registry fallback (first known LGA) — keeps drill-down non-empty
        if (stateSubsMap[stateKey].lgaSet.size === 0) {
          const match = Object.keys(NIGERIA_ADMIN_DATA).find(
            (s) => (normalizeStateName(s) || s) === stateKey,
          );
          if (match) {
            const lgaNames = Object.keys(NIGERIA_ADMIN_DATA[match]);
            if (lgaNames.length > 0) stateSubsMap[stateKey].lgaSet.add(lgaNames[0]);
          }
        }
        // Mirror these into the global LGA counter so KPI tile and drilldown agree
        stateSubsMap[stateKey].lgaSet.forEach((l) => lgas.add(l.toLowerCase()));
      });

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
        state, // already canonical from normalizeStateName
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
      
      // Persist to cache
      localStorage.setItem(`kpi_cache_${selectedProjectId || 'global'}`, JSON.stringify(kpiData));
      localStorage.setItem(`detail_cache_${selectedProjectId || 'global'}`, JSON.stringify(detailData));

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
  }, [fetchKPIs, isSyncing]); // Re-fetch when sync state changes


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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[110px] rounded-xl" />
        ))}
      </div>
    );
  }

  const kpis = [
    {
      key: "totalSubmissions",
      icon: Send, label: "Total Submissions", value: data.totalSubmissions.toLocaleString(),
      sub: `+${data.todaySubmissions} today`,
      from: "hsl(160 70% 38%)", to: "hsl(160 80% 28%)",
      glow: "hsl(160 80% 50% / 0.35)",
      subColor: data.todaySubmissions > 0 ? "text-emerald-100" : "text-white/55",
    },
    {
      key: "syncRate",
      icon: CheckCircle, label: "Sync Rate", value: `${data.syncRate}%`,
      sub: `${data.pendingSync} pending`,
      from: data.syncRate >= 80 ? "hsl(195 80% 42%)" : data.syncRate >= 50 ? "hsl(38 95% 50%)" : "hsl(0 75% 50%)",
      to:   data.syncRate >= 80 ? "hsl(195 90% 30%)" : data.syncRate >= 50 ? "hsl(25 85% 38%)" : "hsl(0 80% 35%)",
      glow: data.syncRate >= 80 ? "hsl(195 90% 55% / 0.35)" : data.syncRate >= 50 ? "hsl(38 95% 60% / 0.35)" : "hsl(0 80% 60% / 0.35)",
      subColor: data.pendingSync > 0 ? "text-amber-100" : "text-white/55",
    },
    {
      key: "dataCollectors",
      icon: Users, label: "Data Collectors", value: data.dataCollectors.toLocaleString(),
      sub: "Unique submitters",
      from: "hsl(220 80% 52%)", to: "hsl(225 85% 38%)",
      glow: "hsl(220 90% 65% / 0.35)",
      subColor: "text-blue-100",
    },
    {
      key: "activeProjects",
      icon: FolderOpen, label: "Active Projects", value: data.activeProjects.toLocaleString(),
      sub: "Currently running",
      from: "hsl(265 65% 55%)", to: "hsl(270 70% 38%)",
      glow: "hsl(265 80% 65% / 0.35)",
      subColor: "text-violet-100",
    },
    {
      key: "geofenceCompliance",
      icon: Activity, label: "Geofence Compliance",
      value: data.geofenceCompliance === null ? "N/A" : `${data.geofenceCompliance}%`,
      sub: data.geofenceCompliance === null ? "No geofenced forms" : data.geofenceCompliance >= 90 ? "Excellent" : data.geofenceCompliance >= 70 ? "Needs attention" : "Critical",
      from: data.geofenceCompliance === null ? "hsl(220 15% 45%)"
        : data.geofenceCompliance >= 90 ? "hsl(160 70% 38%)"
        : data.geofenceCompliance >= 70 ? "hsl(38 95% 50%)"
        : "hsl(0 75% 50%)",
      to: data.geofenceCompliance === null ? "hsl(220 15% 28%)"
        : data.geofenceCompliance >= 90 ? "hsl(160 80% 26%)"
        : data.geofenceCompliance >= 70 ? "hsl(25 85% 38%)"
        : "hsl(0 80% 35%)",
      glow: data.geofenceCompliance === null ? "hsl(220 20% 60% / 0.25)"
        : data.geofenceCompliance >= 90 ? "hsl(160 80% 55% / 0.35)"
        : data.geofenceCompliance >= 70 ? "hsl(38 95% 60% / 0.35)"
        : "hsl(0 80% 60% / 0.35)",
      subColor: data.geofenceCompliance === null ? "text-white/55" : data.geofenceCompliance >= 90 ? "text-emerald-100" : data.geofenceCompliance >= 70 ? "text-amber-100" : "text-red-100",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button
              key={kpi.key}
              onClick={() => setPrimaryRequest({ kind: kpi.key as KPIPrimaryKind, title: kpi.label, selectedProjectId })}
              onContextMenu={(e) => { e.preventDefault(); handleKPIClick(kpi.key); }}
              title="Click to view primary data · Right-click for aggregated breakdown"
              className="group relative rounded-xl p-4 text-left overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              style={{
                background: `linear-gradient(135deg, ${kpi.from} 0%, ${kpi.to} 100%)`,
                boxShadow: `0 4px 14px -4px ${kpi.glow}, inset 0 1px 0 rgba(255,255,255,0.15)`,
              }}
            >
              {/* Decorative orb */}
              <div
                className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-30 blur-xl pointer-events-none transition-opacity group-hover:opacity-50"
                style={{ background: "white" }}
              />
              {/* Top accent ribbon */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/30" />

              <div className="relative flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-white/85 uppercase tracking-[0.12em] leading-none truncate">
                  {kpi.label}
                </p>
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 shrink-0 group-hover:bg-white/25 transition-colors">
                  <Icon className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
              <p className={`relative text-2xl sm:text-3xl font-black text-white leading-none tracking-tight font-display drop-shadow-sm transition-all duration-500 ${isSyncing ? 'opacity-60 animate-pulse scale-95' : 'opacity-100 scale-100'}`}>
                {kpi.value}
              </p>

              <p className={`relative text-[11px] font-semibold mt-1.5 ${kpi.subColor} flex items-center gap-1`}>
                <span className="inline-block w-1 h-1 rounded-full bg-current opacity-70" />
                {kpi.sub}
              </p>
            </button>
          );
        })}
      </div>

      <KPIDrillDownSheet data={drillDown} onClose={() => setDrillDown(null)} />
      <KPIPrimaryDataDialog request={primaryRequest} onClose={() => setPrimaryRequest(null)} />
    </>
  );
};

export default DashboardKPIStrip;
