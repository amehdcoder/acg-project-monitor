import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Cell, ReferenceLine,
} from "recharts";
import {
  Activity, MapPin, AlertTriangle, Filter, RefreshCw, Target, ShieldCheck,
  Boxes, GitCompareArrows, Info, CheckCircle2, ClipboardCheck, Layers, Gauge, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import { getHealthFacilitiesByWard } from "@/lib/grid3NigeriaData";
import { useTargetPopFields } from "@/hooks/useTargetPopFields";
import { toast } from "@/hooks/use-toast";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MdaOperationsPanel from "./MdaOperationsPanel";

interface PowerBIDashboardProps {
  selectedProjectId?: string | null;
}

const norm = (s: any) => String(s ?? "").trim().toLowerCase();
const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);

// Concordance threshold (percentage points) above which sources are deemed discrepant.
const SPREAD_THRESHOLD = 15;

// ─── MDA checklist field resolution helpers (mirror MdaOperationsPanel) ──────
function buildIdNameMap(questions: any[]): Record<string, string> {
  const map: Record<string, string> = {};
  const walk = (items: any[]) => {
    (items || []).forEach((item) => {
      if (!item) return;
      if (Array.isArray(item.questions)) walk(item.questions);
      if (item.id && item.name) map[item.id] = item.name;
    });
  };
  walk(questions);
  return map;
}
function byName(data: Record<string, any>, idName: Record<string, string>) {
  const out: Record<string, any> = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    const name = idName[k];
    if (name) out[name] = v;
    out[k] = v;
  });
  return out;
}
const toNum = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

function KPICard({ title, value, sub, icon: Icon, tone = "primary" }: any) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    sky: "bg-sky-100 text-sky-600",
    indigo: "bg-indigo-100 text-indigo-600",
    emerald: "bg-emerald-100 text-emerald-600",
    amber: "bg-amber-100 text-amber-600",
    rose: "bg-rose-100 text-rose-600",
  };
  return (
    <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
      <CardContent className="p-5">
        <div className={`h-11 w-11 rounded-2xl ${tones[tone]} flex items-center justify-center mb-4`}>
          <Icon className="h-6 w-6" />
        </div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">{title}</p>
        <h3 className="text-3xl font-black text-slate-900 tracking-tighter mt-1">{value}</h3>
        {sub && <p className="text-xs text-slate-500 font-semibold mt-1 leading-snug">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function PowerBIDashboard({ selectedProjectId }: PowerBIDashboardProps) {
  const { calcTargetPop, label: targetPopLabel } = useTargetPopFields();

  const [loading, setLoading] = useState(true);
  const [microplans, setMicroplans] = useState<any[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [mdaRows, setMdaRows] = useState<any[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [selectedState, setSelectedState] = useState("All");
  const [selectedLga, setSelectedLga] = useState("All");
  const [selectedWard, setSelectedWard] = useState("All");
  const [selectedCommunity, setSelectedCommunity] = useState("All");

  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  const geoDataRef = useRef<any | null>(null);
  const [geoReady, setGeoReady] = useState(false);

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    const safety = setTimeout(() => setLoading(false), 25000);
    try {
      if (!silent) setLoading(true);

      const fetchPaginated = async (table: string, sel: string, projectFilter = true) => {
        let all: any[] = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
          let q = supabase.from(table as any).select(sel);
          if (projectFilter && selectedProjectId) q = q.eq("project_id", selectedProjectId);
          const { data, error } = await q.range(from, from + PAGE - 1);
          if (error || !data || data.length === 0) break;
          all = all.concat(data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return all;
      };

      const [microData, surveyData] = await Promise.all([
        fetchPaginated(
          "microplan_entries",
          "id, state, lga, ward, flhf_name, community_name, settlement_name, campaign_type, status, " +
          "estimated_total_population, estimated_children_0_4, estimated_children_5_14, estimated_adults_15_plus, " +
          "trachoma_0_5_months, trachoma_6m_6y, trachoma_7_14y, trachoma_15_plus, " +
          "total_treated, number_of_households, households_treated, community_latitude, community_longitude, " +
          "community_lat_override, community_lng_override",
          true,
        ),
        fetchPaginated(
          "ces_surveys",
          "id, state, lga, ward, flhf_name, community_name, status, supervisor_qc_at, target_sample_n, center_lat, center_lng",
          true,
        ),
      ]);

      // Visits + segments only for the surveys we actually loaded
      const surveyIds = surveyData.map((s) => s.id);
      let visitData: any[] = [];
      let segmentData: any[] = [];
      if (surveyIds.length > 0) {
        const idChunks: string[][] = [];
        for (let i = 0; i < surveyIds.length; i += 100) idChunks.push(surveyIds.slice(i, i + 100));
        for (const chunk of idChunks) {
          const [{ data: v }, { data: seg }] = await Promise.all([
            supabase.from("ces_household_visits" as any)
              .select("id, survey_id, eligible_persons, treated_persons, treatment_took_place, coverage_status")
              .in("survey_id", chunk),
            supabase.from("ces_segments" as any)
              .select("id, survey_id, total_hh_in_segment, hh_treated_in_segment, est_hh, treated_hh, coverage_pct")
              .in("survey_id", chunk),
          ]);
          if (v) visitData = visitData.concat(v);
          if (seg) segmentData = segmentData.concat(seg);
        }
      }

      // MDA supervisory checklist submissions
      let mdaMapped: any[] = [];
      let formQuery = supabase.from("forms" as any).select("id, project_id, questions, settings");
      if (selectedProjectId) formQuery = formQuery.eq("project_id", selectedProjectId);
      const { data: forms } = await formQuery;
      const mdaForms = (forms || []).filter((f: any) => f?.settings?.isMdaChecklist);
      if (mdaForms.length > 0) {
        const idNameByForm: Record<string, Record<string, string>> = {};
        mdaForms.forEach((f: any) => { idNameByForm[f.id] = buildIdNameMap(f.questions || []); });
        const formIds = mdaForms.map((f: any) => f.id);
        let subs: any[] = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
          const { data, error } = await supabase
            .from("form_submissions" as any)
            .select("id, form_id, data, created_at, status")
            .in("form_id", formIds)
            .range(from, from + PAGE - 1)
            .order("created_at", { ascending: false });
          if (error || !data || data.length === 0) break;
          subs = subs.concat(data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        mdaMapped = subs.map((s) => {
          const d = byName(s.data || {}, idNameByForm[s.form_id] || {});
          return {
            id: s.id,
            state: d.state || "",
            lga: d.lga || "",
            ward: d.ward || "",
            community: d.community || "",
            verified: toNum(d.verified_coverage) ?? toNum(d.coverage_achieved),
          };
        });
      }

      setMicroplans(microData);
      setSurveys(surveyData);
      setVisits(visitData);
      setSegments(segmentData);
      setMdaRows(mdaMapped);
      setLastSync(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Operations fetch error:", err);
      if (!silent) toast({ title: "Sync Error", description: "Failed to refresh operations data.", variant: "destructive" });
    } finally {
      clearTimeout(safety);
      setLoading(false);
    }
  }, [selectedProjectId]);

  const scheduleSilentRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => fetchData({ silent: true }), 1500);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    const channels = [
      supabase.channel("ops-micro").on("postgres_changes", { event: "*", schema: "public", table: "microplan_entries" }, scheduleSilentRefresh).subscribe(),
      supabase.channel("ops-surveys").on("postgres_changes", { event: "*", schema: "public", table: "ces_surveys" }, scheduleSilentRefresh).subscribe(),
      supabase.channel("ops-visits").on("postgres_changes", { event: "*", schema: "public", table: "ces_household_visits" }, scheduleSilentRefresh).subscribe(),
      supabase.channel("ops-segments").on("postgres_changes", { event: "*", schema: "public", table: "ces_segments" }, scheduleSilentRefresh).subscribe(),
      supabase.channel("ops-subs").on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, scheduleSilentRefresh).subscribe(),
    ];
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [fetchData, scheduleSilentRefresh]);

  // Re-compute target population whenever the global target-pop selection changes.
  useEffect(() => {
    const handler = () => scheduleSilentRefresh();
    window.addEventListener("microplan-target-pop-fields:changed", handler);
    return () => window.removeEventListener("microplan-target-pop-fields:changed", handler);
  }, [scheduleSilentRefresh]);

  // ─── Filter helpers ────────────────────────────────────────────────────────
  const matchScope = useCallback((r: { state?: string; lga?: string; ward?: string; community?: string; community_name?: string }) => {
    const community = r.community ?? r.community_name;
    if (selectedState !== "All" && norm(r.state) !== norm(selectedState)) return false;
    if (selectedLga !== "All" && norm(r.lga) !== norm(selectedLga)) return false;
    if (selectedWard !== "All" && norm(r.ward) !== norm(selectedWard)) return false;
    if (selectedCommunity !== "All" && norm(community) !== norm(selectedCommunity)) return false;
    return true;
  }, [selectedState, selectedLga, selectedWard, selectedCommunity]);

  const lgaOptions = useMemo(() => (selectedState !== "All" ? getLGAsForState(selectedState) : []), [selectedState]);
  const wardOptions = useMemo(() => (selectedState !== "All" && selectedLga !== "All" ? getWardsForLGA(selectedState, selectedLga) : []), [selectedState, selectedLga]);
  const communityOptions = useMemo(() => {
    const set = new Set<string>();
    [...microplans, ...surveys].forEach((r: any) => {
      if (selectedState !== "All" && norm(r.state) !== norm(selectedState)) return;
      if (selectedLga !== "All" && norm(r.lga) !== norm(selectedLga)) return;
      if (selectedWard !== "All" && norm(r.ward) !== norm(selectedWard)) return;
      if (r.community_name) set.add(r.community_name);
    });
    return Array.from(set).sort();
  }, [microplans, surveys, selectedState, selectedLga, selectedWard]);

  // ─── Community-level triangulation (the single source of truth) ─────────────
  const communities = useMemo(() => {
    type Row = {
      key: string; state: string; lga: string; ward: string; community: string;
      lat: number | null; lng: number | null;
      targetPop: number; targetSource: string;
      microTreated: number; microHH: number; microHHTreated: number;
      microTherap: number | null; microGeo: number | null;
      cesElig: number; cesTreatedPersons: number; cesHHVisited: number; cesHHTreated: number;
      cesSegHH: number; cesSegTreated: number;
      cesTherap: number | null; cesGeo: number | null; cesValidated: boolean; cesVisits: number;
      mdaNum: number; mdaDen: number; mdaVerified: number | null;
    };
    const map = new Map<string, Row>();
    const keyOf = (state: string, lga: string, ward: string, community: string) =>
      [norm(state), norm(lga), norm(ward), norm(community)].join("|");
    const ensure = (state: string, lga: string, ward: string, community: string): Row => {
      const key = keyOf(state, lga, ward, community);
      let r = map.get(key);
      if (!r) {
        r = {
          key, state, lga, ward, community, lat: null, lng: null,
          targetPop: 0, targetSource: "—",
          microTreated: 0, microHH: 0, microHHTreated: 0, microTherap: null, microGeo: null,
          cesElig: 0, cesTreatedPersons: 0, cesHHVisited: 0, cesHHTreated: 0,
          cesSegHH: 0, cesSegTreated: 0, cesTherap: null, cesGeo: null, cesValidated: false, cesVisits: 0,
          mdaNum: 0, mdaDen: 0, mdaVerified: null,
        };
        map.set(key, r);
      }
      return r;
    };

    // Microplanning (target + reported coverage)
    microplans.filter((m) => matchScope(m)).forEach((m) => {
      if (!m.community_name) return;
      const r = ensure(m.state, m.lga, m.ward, m.community_name);
      // Target population uses the global disaggregation selection; fall back to
      // recorded total population so we never show a misleading zero target.
      const selected = calcTargetPop(m);
      if (selected > 0) { r.targetPop += selected; r.targetSource = targetPopLabel; }
      else if (m.estimated_total_population) { r.targetPop += m.estimated_total_population; r.targetSource = "Total population (no disaggregation)"; }
      r.microTreated += m.total_treated || 0;
      r.microHH += m.number_of_households || 0;
      r.microHHTreated += m.households_treated || 0;
      const lat = m.community_lat_override ?? m.community_latitude ?? null;
      const lng = m.community_lng_override ?? m.community_longitude ?? null;
      if (r.lat == null && lat != null) { r.lat = lat; r.lng = lng; }
    });

    // CES surveys → aggregate visits + segments per community
    const visitsBySurvey = new Map<string, any[]>();
    visits.forEach((v) => {
      const arr = visitsBySurvey.get(v.survey_id) || [];
      arr.push(v); visitsBySurvey.set(v.survey_id, arr);
    });
    const segsBySurvey = new Map<string, any[]>();
    segments.forEach((s) => {
      const arr = segsBySurvey.get(s.survey_id) || [];
      arr.push(s); segsBySurvey.set(s.survey_id, arr);
    });

    surveys.filter((s) => matchScope(s)).forEach((s) => {
      if (!s.community_name) return;
      const r = ensure(s.state, s.lga, s.ward, s.community_name);
      if (r.lat == null && s.center_lat != null) { r.lat = s.center_lat; r.lng = s.center_lng; }
      if (s.status === "locked" || s.supervisor_qc_at) r.cesValidated = true;
      (visitsBySurvey.get(s.id) || []).forEach((v) => {
        r.cesVisits += 1;
        if (v.eligible_persons != null) r.cesElig += v.eligible_persons || 0;
        if (v.treated_persons != null) r.cesTreatedPersons += v.treated_persons || 0;
        r.cesHHVisited += 1;
        if (v.treatment_took_place === true || norm(v.coverage_status) === "treated") r.cesHHTreated += 1;
      });
      (segsBySurvey.get(s.id) || []).forEach((seg) => {
        const tot = seg.total_hh_in_segment ?? seg.est_hh ?? 0;
        const tre = seg.hh_treated_in_segment ?? seg.treated_hh ?? 0;
        r.cesSegHH += tot || 0;
        r.cesSegTreated += tre || 0;
      });
    });

    // MDA verified coverage per community
    mdaRows.filter((m) => matchScope({ ...m, community_name: m.community })).forEach((m) => {
      if (!m.community || m.verified == null) return;
      const r = ensure(m.state, m.lga, m.ward, m.community);
      r.mdaNum += m.verified; r.mdaDen += 1;
    });

    // Finalise derived metrics
    map.forEach((r) => {
      r.microTherap = pct(r.microTreated, r.targetPop);
      r.microGeo = pct(r.microHHTreated, r.microHH);
      r.cesTherap = pct(r.cesTreatedPersons, r.cesElig);
      // Geographic coverage: prefer segment household data, else fall back to visit-level treated ratio.
      r.cesGeo = r.cesSegHH > 0 ? pct(r.cesSegTreated, r.cesSegHH) : pct(r.cesHHTreated, r.cesHHVisited);
      r.mdaVerified = r.mdaDen > 0 ? r.mdaNum / r.mdaDen : null;
    });

    return Array.from(map.values());
  }, [microplans, surveys, visits, segments, mdaRows, matchScope, calcTargetPop, targetPopLabel]);

  // Concordance assessment per community (therapeutic coverage across the 3 sources)
  const triangulated = useMemo(() => {
    return communities.map((c) => {
      const refs = [c.microTherap, c.cesTherap, c.mdaVerified].filter((v): v is number => v != null && v > 0);
      const spread = refs.length > 1 ? Math.max(...refs) - Math.min(...refs) : null;
      const sources = [c.microTherap != null, c.cesTherap != null, c.mdaVerified != null].filter(Boolean).length;
      let status: "aligned" | "discrepant" | "insufficient" = "insufficient";
      if (refs.length > 1 && spread != null) status = spread > SPREAD_THRESHOLD ? "discrepant" : "aligned";
      return { ...c, spread, sources, status };
    });
  }, [communities]);

  // Communities with at least one populated source (avoid empty noise)
  const populated = useMemo(
    () => triangulated.filter((c) => c.microTherap != null || c.cesTherap != null || c.mdaVerified != null),
    [triangulated],
  );

  const stats = useMemo(() => {
    const totalTarget = communities.reduce((s, c) => s + c.targetPop, 0);
    const comparable = populated.filter((c) => c.spread != null);
    const aligned = comparable.filter((c) => c.status === "aligned").length;
    const discrepant = comparable.filter((c) => c.status === "discrepant").length;
    const validatedCes = communities.filter((c) => c.cesValidated).length;
    const avg = (arr: (number | null)[]) => {
      const v = arr.filter((x): x is number => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return {
      totalTarget,
      microCommunities: communities.filter((c) => c.targetPop > 0).length,
      cesCommunities: communities.filter((c) => c.cesTherap != null).length,
      cesVisits: communities.reduce((s, c) => s + c.cesVisits, 0),
      validatedCes,
      mdaCommunities: communities.filter((c) => c.mdaVerified != null).length,
      avgMicro: avg(communities.map((c) => c.microTherap)),
      avgCes: avg(communities.map((c) => c.cesTherap)),
      avgMda: avg(communities.map((c) => c.mdaVerified)),
      avgCesGeo: avg(communities.map((c) => c.cesGeo)),
      aligned, discrepant,
      concordanceRate: comparable.length > 0 ? (aligned / comparable.length) * 100 : null,
      comparable: comparable.length,
    };
  }, [communities, populated]);

  // Chart data: per-community therapeutic coverage across the three sources
  const comparisonData = useMemo(() => {
    return populated
      .slice()
      .sort((a, b) => (b.spread ?? -1) - (a.spread ?? -1))
      .slice(0, 12)
      .map((c) => ({
        name: c.community,
        Microplanning: c.microTherap != null ? Math.round(c.microTherap) : null,
        Coverage_Eval: c.cesTherap != null ? Math.round(c.cesTherap) : null,
        MDA_Verified: c.mdaVerified != null ? Math.round(c.mdaVerified) : null,
        spread: c.spread,
        status: c.status,
      }));
  }, [populated]);

  // Variance (McKinsey-style) — spread per comparable community
  const varianceData = useMemo(() => {
    return populated
      .filter((c) => c.spread != null)
      .sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0))
      .slice(0, 12)
      .map((c) => ({ name: c.community, spread: Math.round(c.spread as number), status: c.status }));
  }, [populated]);

  // cesByCommunity for the MDA panel (correct therapeutic from real visit data)
  const cesByCommunity = useMemo(() => {
    const m: Record<string, { cesTherapeutic: number; microTherapeutic: number; microPresent: boolean }> = {};
    communities.forEach((c) => {
      if (!c.community) return;
      m[c.community] = {
        cesTherapeutic: c.cesTherap ?? 0,
        microTherapeutic: c.microTherap ?? 0,
        microPresent: c.targetPop > 0,
      };
    });
    return m;
  }, [communities]);

  // Auto-generated executive interpretation (data-driven, no hallucination)
  const insight = useMemo(() => {
    if (populated.length === 0) return "No Microplanning, Coverage Evaluation or MDA records match the current scope yet. Charts populate automatically as field data syncs.";
    const parts: string[] = [];
    if (stats.concordanceRate != null) {
      parts.push(`Across ${stats.comparable} communit${stats.comparable === 1 ? "y" : "ies"} with two or more data sources, ${Math.round(stats.concordanceRate)}% are concordant (sources agree within ${SPREAD_THRESHOLD} pts).`);
    } else {
      parts.push("Most communities currently report only a single data source, so cross-source concordance cannot yet be computed.");
    }
    const worst = varianceData[0];
    if (worst && worst.spread > SPREAD_THRESHOLD) {
      parts.push(`The widest gap is in ${worst.name} (${worst.spread} pts) — reconcile Microplanning, Coverage Evaluation and MDA figures there before reporting coverage.`);
    }
    if (stats.validatedCes === 0 && stats.cesCommunities > 0) {
      parts.push("None of the Coverage Evaluation surveys in scope are supervisor-validated (locked/QC) yet, so triangulation uses provisional field figures.");
    }
    return parts.join(" ");
  }, [populated, stats, varianceData]);

  // ─── LGA-level choropleth aggregation (fill the whole LGA, not points) ───────
  // Normalised matching key tolerant of spacing/punctuation differences between
  // the DB names and the GADM boundary names (e.g. "Aba North" vs "aba-north").
  const lgaKey = useCallback((state: string, lga: string) => {
    const clean = (s: any) =>
      String(s ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    // Canonicalise state aliases so DB names match the GADM boundary names.
    const stateAlias: Record<string, string> = {
      federalcapitalterritory: "abuja",
      fct: "abuja",
      nassarawa: "nasarawa",
    };
    const st = clean(state);
    return `${stateAlias[st] ?? st}|${clean(lga)}`;
  }, []);


  type LgaAgg = {
    state: string; lga: string;
    status: "discrepant" | "aligned" | "single" | "none";
    micro: number | null; ces: number | null; mda: number | null;
    communities: number; comparable: number;
  };

  const lgaStatusMap = useMemo(() => {
    const m = new Map<string, LgaAgg>();
    const buckets = new Map<string, { micro: number[]; ces: number[]; mda: number[]; statuses: string[]; state: string; lga: string }>();
    populated.forEach((c) => {
      if (!c.lga) return;
      const k = lgaKey(c.state, c.lga);
      let b = buckets.get(k);
      if (!b) { b = { micro: [], ces: [], mda: [], statuses: [], state: c.state, lga: c.lga }; buckets.set(k, b); }
      if (c.microTherap != null) b.micro.push(c.microTherap);
      if (c.cesTherap != null) b.ces.push(c.cesTherap);
      if (c.mdaVerified != null) b.mda.push(c.mdaVerified);
      b.statuses.push(c.status);
    });
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    buckets.forEach((b, k) => {
      const comparable = b.statuses.filter((s) => s === "aligned" || s === "discrepant").length;
      let status: LgaAgg["status"] = "none";
      if (b.statuses.includes("discrepant")) status = "discrepant";
      else if (b.statuses.includes("aligned")) status = "aligned";
      else if (b.statuses.length > 0) status = "single";
      m.set(k, {
        state: b.state, lga: b.lga, status,
        micro: avg(b.micro), ces: avg(b.ces), mda: avg(b.mda),
        communities: b.statuses.length, comparable,
      });
    });
    return m;
  }, [populated, lgaKey]);

  // Resolve a boundary feature to its aggregation, tolerant of GADM name quirks
  // (truncations like "Arochukw" → "Arochukwu", spacing differences, etc.).
  const resolveLgaAgg = useCallback(
    (featState: string, featLga: string): LgaAgg | undefined => {
      const key = lgaKey(featState, featLga);
      const direct = lgaStatusMap.get(key);
      if (direct) return direct;
      const [st, lg] = key.split("|");
      if (!lg) return undefined;
      let best: LgaAgg | undefined;
      lgaStatusMap.forEach((agg, k) => {
        if (best) return;
        const [s, l] = k.split("|");
        if (s !== st || !l) return;
        if (
          l === lg ||
          l.startsWith(lg) ||
          lg.startsWith(l) ||
          (l.length >= 5 && lg.length >= 5 && (l.includes(lg) || lg.includes(l)))
        ) {
          best = agg;
        }
      });
      return best;
    },
    [lgaStatusMap, lgaKey],
  );

  // Load the Nigeria LGA boundary GeoJSON once (cached).
  useEffect(() => {
    if (geoDataRef.current) { setGeoReady(true); return; }
    let cancelled = false;
    fetch("/nigeria-lga.geojson")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => { if (!cancelled) { geoDataRef.current = data; setGeoReady(true); } })
      .catch((e) => console.warn("LGA boundaries failed to load", e));
    return () => { cancelled = true; };
  }, []);


  // ─── Leaflet choropleth map (WHO/UN/BMGF style — LGA polygon fills) ──────────
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    const init = () => {
      try {
        const map = L.map(container, { zoomControl: true, attributionControl: false, preferCanvas: false });
        // Subtle, professional reference basemap (CARTO Positron — no labels) so
        // the coloured LGA fills read like a clean thematic public-health map.
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 19, opacity: 0.85 }).addTo(map);
        mapRef.current = map;
        map.setView([9.082, 8.6753], 6);
      } catch (e) { console.warn("Leaflet init failed", e); }
    };
    if (!mapRef.current) {
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        const ro = new ResizeObserver(() => {
          if (container.clientWidth > 0 && container.clientHeight > 0 && !mapRef.current) { init(); ro.disconnect(); }
        });
        ro.observe(container);
        return () => ro.disconnect();
      }
      init();
    }
    const map = mapRef.current;
    if (!map) return;

    const geo = geoDataRef.current;
    if (!geoReady || !geo) return;

    // Colour ramp keyed to concordance status (categorical, colour-blind safe).
    const fillFor = (status: LgaAgg["status"] | undefined) => {
      switch (status) {
        case "discrepant": return "#ef4444";
        case "aligned": return "#10b981";
        case "single": return "#f59e0b";
        default: return "#e2e8f0"; // no data — faint neutral
      }
    };

    // Remove any prior thematic layer before re-rendering.
    if (geoLayerRef.current) { try { map.removeLayer(geoLayerRef.current); } catch { /* noop */ } geoLayerRef.current = null; }

    const row = (label: string, v: number | null) =>
      `<div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;margin-bottom:2px;"><span style="color:#64748b;font-weight:700;">${label}</span><span style="font-weight:900;color:#0f172a;">${v != null ? v.toFixed(0) + "%" : "—"}</span></div>`;

    const dataBounds: L.LatLngBounds = L.latLngBounds([]);

    const layer = L.geoJSON(geo, {
      style: (feature: any) => {
        const agg = resolveLgaAgg(feature?.properties?.state, feature?.properties?.lga);
        const hasData = !!agg;
        return {
          fillColor: fillFor(agg?.status),
          fillOpacity: hasData ? 0.72 : 0.18,
          color: hasData ? "#ffffff" : "#cbd5e1",
          weight: hasData ? 1.2 : 0.5,
          opacity: 1,
        } as L.PathOptions;
      },
      onEachFeature: (feature: any, lyr: L.Layer) => {
        const k = lgaKey(feature?.properties?.state, feature?.properties?.lga);
        const agg = lgaStatusMap.get(k);
        const stateName = feature?.properties?.state || "—";
        const lgaName = feature?.properties?.lga || "—";
        const statusLabel = agg
          ? agg.status === "discrepant" ? "Sources disagree" : agg.status === "aligned" ? "Sources aligned" : "Single source"
          : "No data yet";
        const popup = `<div style="min-width:210px;font-family:inherit;padding:4px;">
            <div style="font-weight:900;font-size:14px;color:#0f172a;">${lgaName} LGA</div>
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">${stateName} State · ${statusLabel}</div>
            <div style="background:#f8fafc;padding:8px;border-radius:8px;border:1px solid #e2e8f0;">
              ${row("Microplanning", agg?.micro ?? null)}
              ${row("Coverage Eval (3D)", agg?.ces ?? null)}
              ${row("MDA Verified", agg?.mda ?? null)}
              <div style="border-top:1px dashed #cbd5e1;margin-top:4px;padding-top:4px;">${row("Communities", agg ? agg.communities : null).replace("%", "")}</div>
            </div>
            ${agg?.status === "discrepant" ? '<div style="margin-top:8px;background:#fef2f2;border:1px solid #fecaca;padding:6px;border-radius:6px;font-size:10px;color:#b91c1c;text-align:center;font-weight:800;">⚠️ SOURCES DISAGREE — RECONCILE</div>' : ""}
            ${agg?.status === "single" ? '<div style="margin-top:8px;background:#fffbeb;border:1px solid #fde68a;padding:6px;border-radius:6px;font-size:10px;color:#b45309;text-align:center;font-weight:800;">ⓘ ONLY ONE SOURCE REPORTED</div>' : ""}
          </div>`;
        (lyr as L.Path).bindPopup(popup, { maxWidth: 280 });
        lyr.on({
          mouseover: () => { try { (lyr as L.Path).setStyle({ weight: 2.4, color: "#0f172a" }); (lyr as any).bringToFront?.(); } catch { /* noop */ } },
          mouseout: () => { try { layer.resetStyle(lyr as any); } catch { /* noop */ } },
        });
        if (agg) {
          try { dataBounds.extend((lyr as any).getBounds()); } catch { /* noop */ }
        }
      },
    });
    layer.addTo(map);
    geoLayerRef.current = layer;

    if (dataBounds.isValid()) map.fitBounds(dataBounds, { padding: [24, 24], maxZoom: 9 });
    else map.setView([9.082, 8.6753], 6);
  }, [lgaStatusMap, geoReady, lgaKey]);

  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } }, []);


  const fmtPct = (v: number | null) => (v != null ? `${v.toFixed(0)}%` : "—");

  return (
    <div className="min-h-full bg-[#F1F5F9] p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-3xl bg-slate-900 flex items-center justify-center shadow-xl ring-4 ring-white">
            <GitCompareArrows className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-none">COVERAGE TRUTH OPERATIONS</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 text-[11px] font-bold">
                LIVE · {lastSync || "syncing…"}
              </Badge>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest bg-white px-2 py-1 rounded-md shadow-sm border border-slate-100">
                Microplanning · Coverage Evaluation 3D · MDA Supervision
              </span>
            </div>
          </div>
        </div>

        {/* Cascading filters */}
        <div className="flex flex-wrap items-end gap-2 p-3 bg-white/70 backdrop-blur-xl border border-white rounded-2xl shadow-lg">
          <Filter className="h-4 w-4 text-primary mb-2.5" />
          <FilterSelect label="State" value={selectedState} onChange={(v) => { setSelectedState(v); setSelectedLga("All"); setSelectedWard("All"); setSelectedCommunity("All"); }} options={getAllStates()} allLabel="All States" />
          <FilterSelect label="LGA" value={selectedLga} onChange={(v) => { setSelectedLga(v); setSelectedWard("All"); setSelectedCommunity("All"); }} options={lgaOptions} disabled={selectedState === "All"} allLabel="All LGAs" />
          <FilterSelect label="Ward" value={selectedWard} onChange={(v) => { setSelectedWard(v); setSelectedCommunity("All"); }} options={wardOptions} disabled={selectedLga === "All"} allLabel="All Wards" />
          <FilterSelect label="Community" value={selectedCommunity} onChange={setSelectedCommunity} options={communityOptions} disabled={selectedState === "All"} allLabel="All Communities" />
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-slate-100 mb-0.5" onClick={() => fetchData()}>
            <RefreshCw className={`h-5 w-5 text-slate-600 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-primary/5 border border-primary/15 text-primary text-xs font-bold uppercase tracking-wider">
          <RefreshCw className="h-4 w-4 animate-spin" /> Synchronizing operations command…
        </div>
      )}

      {/* Executive insight */}
      <Card className="border-none shadow-xl rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white overflow-hidden">
        <CardContent className="p-6 flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center shrink-0">
            <TrendingUp className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-emerald-300">Executive Interpretation</h3>
            <p className="text-sm text-slate-200 mt-1.5 leading-relaxed font-medium">{insight}</p>
            <p className="text-[11px] text-slate-400 mt-2">Target population basis: <span className="font-bold text-slate-200">{targetPopLabel}</span></p>
          </div>
        </CardContent>
      </Card>

      {/* KPI ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <KPICard title="Target Population" value={stats.totalTarget.toLocaleString()} sub={`${stats.microCommunities} microplanned communities`} icon={Target} tone="primary" />
        <KPICard title="Microplan Coverage" value={fmtPct(stats.avgMicro)} sub="Reported therapeutic (avg)" icon={ClipboardCheck} tone="sky" />
        <KPICard title="CES Therapeutic" value={fmtPct(stats.avgCes)} sub={`${stats.cesVisits} household visits`} icon={Boxes} tone="indigo" />
        <KPICard title="CES Geographic" value={fmtPct(stats.avgCesGeo)} sub="Households reached (avg)" icon={Layers} tone="indigo" />
        <KPICard title="MDA Verified" value={fmtPct(stats.avgMda)} sub={`${stats.mdaCommunities} supervised communities`} icon={ShieldCheck} tone="emerald" />
        <KPICard title="Concordance" value={stats.concordanceRate != null ? `${Math.round(stats.concordanceRate)}%` : "—"} sub={`${stats.aligned}/${stats.comparable} sources agree`} icon={Gauge} tone="amber" />
        <KPICard title="Discrepancies" value={stats.discrepant} sub={`>${SPREAD_THRESHOLD} pts variance`} icon={AlertTriangle} tone="rose" />
      </div>

      {/* Map + variance */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2 border-none shadow-xl bg-white rounded-3xl overflow-hidden">
          <CardHeader className="p-6 border-b border-slate-50">
            <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" /> Concordance Map — Nigeria
            </CardTitle>
            <CardDescription className="text-xs">Each LGA shaded by Microplanning vs Coverage Evaluation vs MDA concordance</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-[420px] w-full rounded-2xl overflow-hidden border border-slate-200 shadow-inner relative z-0">
              <div ref={mapContainerRef} className="w-full h-full" />
              <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur px-3 py-2.5 rounded-xl border border-slate-200 shadow-lg z-[1000] flex flex-col gap-1.5 pointer-events-none">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Concordance by LGA</span>
                {[["#10b981", "Aligned"], ["#ef4444", "Discrepant"], ["#f59e0b", "Single source"], ["#e2e8f0", "No data"]].map(([c, l]) => (
                  <div key={l} className="flex items-center gap-2">
                    <div className="w-4 h-3 rounded-sm border border-white shadow-sm" style={{ background: c }} />
                    <span className="text-[10px] font-black text-slate-700">{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>

        </Card>

        <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
          <CardHeader className="p-6 border-b border-slate-50">
            <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> Source Variance
            </CardTitle>
            <CardDescription className="text-xs">Coverage spread between sources (percentage points)</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {varianceData.length === 0 ? (
              <EmptyState text="No community yet has two comparable sources." />
            ) : (
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={varianceData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fontWeight: 700 }} />
                  <Tooltip formatter={(v: any) => [`${v} pts`, "Spread"]} />
                  <ReferenceLine x={SPREAD_THRESHOLD} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: "Threshold", fontSize: 10, fill: "#f43f5e" }} />
                  <Bar dataKey="spread" radius={[0, 8, 8, 0]} barSize={18}>
                    {varianceData.map((d, i) => (
                      <Cell key={i} fill={d.status === "discrepant" ? "#ef4444" : "#10b981"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Grouped comparison */}
      <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
        <CardHeader className="p-6 border-b border-slate-50">
          <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5 text-primary" /> Therapeutic Coverage by Source
          </CardTitle>
          <CardDescription className="text-xs">
            Microplanning (reported) vs Coverage Evaluation 3D (measured) vs MDA Supervision (verified), per community
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {comparisonData.length === 0 ? (
            <EmptyState text="No coverage data in the selected scope yet." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={comparisonData} margin={{ left: 0, right: 20, top: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(v: any) => (v == null ? ["—", ""] : [`${v}%`, ""])} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 800 }} />
                  <ReferenceLine y={80} stroke="#16a34a" strokeDasharray="4 4" label={{ value: "80% target", fontSize: 10, fill: "#16a34a", position: "right" }} />
                  <Bar dataKey="Microplanning" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Coverage_Eval" name="Coverage Eval 3D" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="MDA_Verified" name="MDA Verified" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-sm font-semibold text-slate-600">
                  <span className="text-slate-900 font-black">How to read this:</span> bars should sit close together for each community. A tall Microplanning bar beside a short Coverage Evaluation bar means reported coverage is not confirmed on the ground — prioritise mop-up or data reconciliation there.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Triangulation table */}
      <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
        <CardHeader className="p-6 border-b border-slate-50">
          <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" /> Community Triangulation Ledger
          </CardTitle>
          <CardDescription className="text-xs">Full reconciliation of all three data sources, sorted by variance</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {populated.length === 0 ? (
            <div className="p-8"><EmptyState text="No reconciliations available for the current scope." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-black">Community</th>
                    <th className="px-5 py-3 font-black">Location</th>
                    <th className="px-5 py-3 font-black text-right">Target Pop</th>
                    <th className="px-5 py-3 font-black text-right">Microplan</th>
                    <th className="px-5 py-3 font-black text-right">CES 3D</th>
                    <th className="px-5 py-3 font-black text-right">MDA</th>
                    <th className="px-5 py-3 font-black text-right">CES Geo</th>
                    <th className="px-5 py-3 font-black text-right">Spread</th>
                    <th className="px-5 py-3 font-black text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {triangulated
                    .filter((c) => c.microTherap != null || c.cesTherap != null || c.mdaVerified != null)
                    .sort((a, b) => (b.spread ?? -1) - (a.spread ?? -1))
                    .map((c) => (
                      <tr key={c.key} className={`border-b border-slate-100 ${c.status === "discrepant" ? "bg-rose-50/40" : "bg-white"} hover:bg-slate-50`}>
                        <td className="px-5 py-3 font-bold text-slate-900">
                          {c.community}
                          {c.cesValidated && <Badge className="ml-2 bg-emerald-100 text-emerald-700 border-none text-[9px] font-black">QC</Badge>}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500">{c.lga || "—"}, {c.ward || "—"}</td>
                        <td className="px-5 py-3 text-right text-slate-700">{c.targetPop > 0 ? c.targetPop.toLocaleString() : "—"}</td>
                        <td className="px-5 py-3 text-right font-medium">{fmtPct(c.microTherap)}</td>
                        <td className="px-5 py-3 text-right font-medium">{fmtPct(c.cesTherap)}</td>
                        <td className="px-5 py-3 text-right font-medium">{fmtPct(c.mdaVerified)}</td>
                        <td className="px-5 py-3 text-right text-slate-700">{fmtPct(c.cesGeo)}</td>
                        <td className="px-5 py-3 text-right">
                          {c.spread != null ? (
                            <Badge className={`${c.spread > SPREAD_THRESHOLD ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"} border-none`}>
                              {c.spread.toFixed(0)} pts
                            </Badge>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {c.status === "discrepant" ? <AlertTriangle className="h-5 w-5 text-rose-500 mx-auto" />
                            : c.status === "aligned" ? <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                            : <span className="text-[10px] font-bold text-amber-600 uppercase">1 source</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed MDA supervision intelligence */}
      <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
        <CardContent className="p-6">
          <MdaOperationsPanel
            selectedProjectId={selectedProjectId}
            filters={{ state: selectedState, lga: selectedLga, ward: selectedWard, community: selectedCommunity }}
            cesByCommunity={cesByCommunity}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, disabled, allLabel }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean; allLabel: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 mb-1">{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-10 border-2 border-slate-200 bg-white hover:border-primary/40 text-slate-900 text-[13px] font-bold min-w-[140px] rounded-xl disabled:opacity-40 disabled:bg-slate-50">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent className="rounded-xl shadow-2xl bg-white max-h-72">
          <SelectItem value="All" className="font-bold text-primary">{allLabel}</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o} className="font-medium text-slate-900">{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
      <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center">
        <Info className="h-7 w-7 text-slate-300" />
      </div>
      <p className="text-sm font-bold text-slate-400 max-w-xs">{text}</p>
    </div>
  );
}
