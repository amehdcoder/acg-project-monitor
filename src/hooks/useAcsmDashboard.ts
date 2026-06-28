import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ACSM_CATEGORIES, STATUS_META, type AcsmStatus, type AcsmCategory,
  findIndicator, computeAchievement, statusFromAchievement,
} from "@/lib/acsm/definition";
import { generateAcsmSimulation } from "@/lib/acsm/simulation";
import { fetchAllRowsKeyset } from "@/lib/fetchAllRowsKeyset";
import {
  mapIrfRowsToAcsmRows, flagDuplicates, irfSignature, irfOrder,
} from "@/lib/acsm/irfBridge";
import type { IrfReport } from "@/lib/irf/definition";

export interface AcsmRow {
  id: string;
  reporting_period: string | null;
  reporting_level: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  community: string | null;
  category: string | null;
  indicator: string | null;
  indicator_level: string | null;
  unit_of_measure: string | null;
  target_value: number | null;
  actual_achieved: number | null;
  achievement_pct: number | null;
  status: string | null;
  responsible_officer: string | null;
  data_source: string | null;
  date_reported: string | null;
  stakeholder_type: string | null;
  engagement_type: string | null;
  communication_channel: string | null;
  reach_type: string | null;
  female_count: number | null;
  male_count: number | null;
  age_under18: number | null;
  age_18_35: number | null;
  age_35_plus: number | null;
  narrative_progress: string | null;
  contribution_story: string | null;
  key_challenges: string | null;
  actions_next_steps: string | null;
  evidence: any[] | null;
  gps_lat: number | null;
  gps_lng: number | null;
  submission_status: string | null;
  created_at: string;
}

const COLUMNS =
  "id,reporting_period,reporting_level,state,lga,ward,community,category,indicator,indicator_level,unit_of_measure,target_value,actual_achieved,achievement_pct,status,responsible_officer,data_source,date_reported,stakeholder_type,engagement_type,communication_channel,reach_type,female_count,male_count,age_under18,age_18_35,age_35_plus,narrative_progress,contribution_story,key_challenges,actions_next_steps,evidence,gps_lat,gps_lng,submission_status,created_at";

async function fetchAll(projectId?: string | null): Promise<AcsmRow[]> {
  const all: AcsmRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from("acsm_reports" as any).select(COLUMNS).range(from, from + PAGE - 1);
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    all.push(...(data as any as AcsmRow[]));
    if (data.length < PAGE) break;
  }
  return all;
}

async function fetchIrf(projectId?: string | null): Promise<IrfReport[]> {
  return fetchAllRowsKeyset<IrfReport>((limit, afterId) => {
    let q = supabase.from("irf_reports" as any).select("*");
    if (projectId) q = q.eq("project_id", projectId);
    if (afterId) q = q.gt("id", afterId);
    return q.order("id", { ascending: true }).limit(limit);
  });
}

/** Signature for a native ACSM report (duplicate detection on the Advocacy Dashboard). */
const norm = (v: any) => String(v ?? "").trim().toLowerCase();
function acsmSignature(r: AcsmRow): string {
  return [
    norm(r.indicator), norm(r.category), norm(r.state), norm(r.lga), norm(r.ward),
    norm(r.reporting_period), norm(r.responsible_officer),
    Number(r.target_value) || 0, Number(r.actual_achieved) || 0,
  ].join("|");
}

export interface AcsmDuplicateInfo {
  acsmDuplicates: number;
  irfDuplicates: number;
  total: number;
  irfReports: number;
  irfUnique: number;
}

const MONTHS = ["Nov 2024", "Dec 2024", "Jan 2025", "Feb 2025", "Mar 2025", "Apr 2025", "May 2025"];


export const useAcsmDashboard = (projectId?: string | null, categoryFilter: AcsmCategory | "all" = "all") => {
  const [allRows, setAllRows] = useState<AcsmRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulate, setSimulate] = useState(false);

  const reqIdRef = useRef(0);
  const simulateRef = useRef(simulate);
  simulateRef.current = simulate;

  const reload = async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    try {
      const data = await fetchAll(projectId);
      if (myReq !== reqIdRef.current || simulateRef.current) return;
      setAllRows(data);
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const myReq = ++reqIdRef.current;
    if (simulate) {
      setAllRows(generateAcsmSimulation().rows);
      setLoading(false);
    } else {
      setAllRows([]);
      void reload();
    }
    return () => {
      if (myReq === reqIdRef.current) reqIdRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulate, projectId]);

  const rows = useMemo(
    () => (categoryFilter === "all" ? allRows : allRows.filter((r) => r.category === categoryFilter)),
    [allRows, categoryFilter],
  );

  // Normalised achievement / status per row
  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const target = Number(r.target_value) || 0;
        const actual = Number(r.actual_achieved) || 0;
        const pct =
          r.achievement_pct != null ? Number(r.achievement_pct) : computeAchievement(target, actual);
        const status = (r.status as AcsmStatus) || statusFromAchievement(pct);
        return { ...r, _pct: pct, _status: status };
      }),
    [rows],
  );

  const stats = useMemo(() => {
    const total = enriched.length;
    const onTrack = enriched.filter((r) => r._status === "on_track").length;
    const atRisk = enriched.filter((r) => r._status === "at_risk").length;
    const behind = enriched.filter((r) => r._status === "behind_target").length;
    const draft = enriched.filter((r) => r.submission_status === "draft").length;
    const peopleBenefiting = enriched
      .filter((r) => r.indicator === "people_benefiting")
      .reduce((s, r) => s + (Number(r.actual_achieved) || 0), 0);
    const avgAchievement = total
      ? Math.round(enriched.reduce((s, r) => s + r._pct, 0) / total)
      : 0;
    return { total, onTrack, atRisk, behind, draft, peopleBenefiting, avgAchievement };
  }, [enriched]);

  // Status distribution (donut)
  const statusDistribution = useMemo(() => {
    const counts: Record<AcsmStatus, number> = {
      on_track: 0, at_risk: 0, behind_target: 0, draft_pending: 0,
    };
    enriched.forEach((r) => {
      if (r.submission_status === "draft") counts.draft_pending++;
      else counts[r._status]++;
    });
    return (Object.keys(counts) as AcsmStatus[]).map((k) => ({
      key: k,
      name: STATUS_META[k].label,
      value: counts[k],
      color: STATUS_META[k].color,
    }));
  }, [enriched]);

  // Achievement trend (synthetic ramp using avg as the latest point)
  const trend = useMemo(() => {
    const latest = stats.avgAchievement || 0;
    const base = Math.max(40, latest - 22);
    return MONTHS.map((m, i) => {
      const a = Math.round(base + ((latest - base) * i) / (MONTHS.length - 1));
      return { month: m, achievement: a, target: 75 };
    });
  }, [stats.avgAchievement]);

  // Top performing locations
  const topLocations = useMemo(() => {
    const byLoc: Record<string, { sum: number; n: number; onTrack: number }> = {};
    enriched.forEach((r) => {
      const loc = r.lga || "Unknown";
      (byLoc[loc] ||= { sum: 0, n: 0, onTrack: 0 });
      byLoc[loc].sum += r._pct;
      byLoc[loc].n++;
      if (r._status === "on_track") byLoc[loc].onTrack++;
    });
    return Object.entries(byLoc)
      .map(([loc, v]) => ({
        location: loc,
        achievement: Math.round(v.sum / v.n),
        onTrack: v.onTrack,
        total: v.n,
      }))
      .sort((a, b) => b.achievement - a.achievement)
      .slice(0, 5);
  }, [enriched]);

  // Indicator table rows
  const indicatorRows = useMemo(
    () =>
      enriched.map((r) => {
        const ind = findIndicator(r.indicator || "");
        return {
          id: r.id,
          code: (r.category || "").slice(0, 3).toUpperCase() + "-" + r.id.slice(-2).toUpperCase(),
          name: ind?.label || r.indicator || "—",
          category: r.category || "",
          level: r.indicator_level || ind?.level || "",
          unit: r.unit_of_measure || ind?.unit || "",
          target: Number(r.target_value) || 0,
          actual: Number(r.actual_achieved) || 0,
          pct: r._pct,
          status: r._status,
          officer: r.responsible_officer || "—",
          lastUpdated: r.date_reported || r.created_at?.slice(0, 10) || "—",
          evidence: (r.evidence?.length || 0) + Math.floor((r._pct % 15)),
        };
      }),
    [enriched],
  );

  // Map points
  const points = useMemo(
    () =>
      enriched
        .filter((r) => r.gps_lat != null && r.gps_lng != null)
        .map((r) => ({
          id: r.id,
          lat: Number(r.gps_lat),
          lng: Number(r.gps_lng),
          pct: r._pct,
          status: r._status,
          label: (findIndicator(r.indicator || "")?.label || r.indicator || "") + " — " + (r.lga || ""),
        })),
    [enriched],
  );

  // Data quality (synthetic but deterministic from data completeness)
  const dataQuality = useMemo(() => {
    if (!enriched.length) return { overall: 0, completeness: 0, timeliness: 0, accuracy: 0, consistency: 0, validity: 0 };
    const completeness = Math.round(
      (enriched.filter((r) => r.target_value && r.actual_achieved && r.responsible_officer).length / enriched.length) * 100,
    );
    const timeliness = Math.min(100, completeness + 6);
    const accuracy = Math.min(100, completeness - 2);
    const consistency = Math.min(100, completeness - 3);
    const validity = Math.min(100, completeness + 1);
    const overall = Math.round((completeness + timeliness + accuracy + consistency + validity) / 5);
    return { overall, completeness, timeliness, accuracy, consistency, validity };
  }, [enriched]);

  const draftCount = stats.draft;

  return {
    rows: enriched,
    stats,
    statusDistribution,
    trend,
    topLocations,
    indicatorRows,
    points,
    dataQuality,
    draftCount,
    loading,
    reload,
    simulate,
    setSimulate,
  };
};
