import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRowsKeyset } from "@/lib/fetchAllRowsKeyset";
import { flagDuplicates, irfSignature, irfOrder } from "@/lib/acsm/irfBridge";
import { IRF_METRIC_FIELDS, IRF_SECTIONS, type IrfReport } from "@/lib/irf/definition";

async function fetchAll(projectId?: string | null): Promise<IrfReport[]> {
  return fetchAllRowsKeyset<IrfReport>((limit, afterId) => {
    let q = supabase.from("irf_reports" as any).select("*");
    if (projectId) q = q.eq("project_id", projectId);
    if (afterId) q = q.gt("id", afterId);
    return q.order("id", { ascending: true }).limit(limit);
  });
}

const num = (v: any) => (v == null || v === "" ? 0 : Number(v) || 0);

export const useIrfDashboard = (projectId?: string | null) => {
  const [rows, setRows] = useState<IrfReport[]>([]);
  const [loading, setLoading] = useState(true);
  const reqIdRef = useRef(0);

  const reload = async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    try {
      const data = await fetchAll(projectId);
      if (myReq !== reqIdRef.current) return;
      setRows(data);
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Realtime: instantly refresh when a report is inserted/updated/deleted.
  useEffect(() => {
    const channel = supabase
      .channel(`irf_reports_${projectId || "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "irf_reports" },
        () => { void reload(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Headline totals across all metric fields.
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    IRF_METRIC_FIELDS.forEach((f) => { t[f.key] = 0; });
    rows.forEach((r) => IRF_METRIC_FIELDS.forEach((f) => { t[f.key] += num(r[f.key]); }));
    return t;
  }, [rows]);

  const stats = useMemo(() => {
    const totalReports = rows.length;
    const lgas = new Set(rows.map((r) => r.lga).filter(Boolean)).size;
    const peopleReached =
      totals.total_reach + totals.radio_estimated_reach + totals.attendance_men + totals.attendance_women;
    const stakeholdersEngaged =
      totals.policy_makers_engaged + totals.traditional_leaders_engaged +
      totals.healthcare_workers_engaged + totals.religious_leaders_engaged +
      totals.mdas_visited_count;
    const ncTotal = totals.noncompliance_cases;
    const ncResolved = totals.cases_resolved;
    const ncResolutionRate = ncTotal ? Math.round((ncResolved / ncTotal) * 100) : 0;
    const awarenessActivities =
      totals.radio_messages_aired + totals.town_announcements + totals.mosque_announcements +
      totals.iec_materials_distributed + totals.community_dialogue_sessions;
    return { totalReports, lgas, peopleReached, stakeholdersEngaged, ncTotal, ncResolved, ncResolutionRate, awarenessActivities };
  }, [rows, totals]);

  // Per-section totals (sum of that section's metric fields).
  const sectionTotals = useMemo(
    () =>
      IRF_SECTIONS.map((s) => {
        const keys = s.groups.flatMap((g) => g.fields.filter((f) => f.metric).map((f) => f.key));
        const value = keys.reduce((sum, k) => sum + (totals[k] || 0), 0);
        return { id: s.id, name: s.short, value, color: s.color };
      }),
    [totals],
  );

  // Gender split of community-dialogue attendance.
  const genderSplit = useMemo(
    () => [
      { name: "Women", value: totals.attendance_women, color: "#db2777" },
      { name: "Men", value: totals.attendance_men, color: "#2563eb" },
    ],
    [totals],
  );

  // Non-compliance breakdown.
  const ncBreakdown = useMemo(
    () => [
      { name: "Resolved", value: totals.cases_resolved, color: "#16a34a" },
      { name: "Pending", value: totals.cases_pending, color: "#f59e0b" },
    ],
    [totals],
  );

  // Top LGAs by people reached.
  const topLgas = useMemo(() => {
    const byLga: Record<string, { reach: number; reports: number; stakeholders: number }> = {};
    rows.forEach((r) => {
      const lga = r.lga || "Unspecified";
      (byLga[lga] ||= { reach: 0, reports: 0, stakeholders: 0 });
      byLga[lga].reach += num(r.total_reach) + num(r.radio_estimated_reach);
      byLga[lga].stakeholders +=
        num(r.policy_makers_engaged) + num(r.traditional_leaders_engaged) +
        num(r.healthcare_workers_engaged) + num(r.religious_leaders_engaged);
      byLga[lga].reports += 1;
    });
    return Object.entries(byLga)
      .map(([lga, v]) => ({ lga, ...v }))
      .sort((a, b) => b.reach - a.reach)
      .slice(0, 8);
  }, [rows]);

  // Monthly trend of people reached & reports.
  const trend = useMemo(() => {
    const byMonth: Record<string, { reach: number; reports: number }> = {};
    rows.forEach((r) => {
      const key = (r.reporting_month || r.created_at || "").slice(0, 7);
      if (!key) return;
      (byMonth[key] ||= { reach: 0, reports: 0 });
      byMonth[key].reach += num(r.total_reach) + num(r.radio_estimated_reach);
      byMonth[key].reports += 1;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));
  }, [rows]);

  // GPS points for the map.
  const points = useMemo(
    () =>
      rows
        .filter((r) => r.gps_lat != null && r.gps_lng != null)
        .map((r) => ({
          id: r.id,
          lat: Number(r.gps_lat),
          lng: Number(r.gps_lng),
          reach: num(r.total_reach),
          label: `${r.lga || ""} ${r.ward ? "— " + r.ward : ""}`.trim(),
        })),
    [rows],
  );

  const dataQuality = useMemo(() => {
    if (!rows.length) return 0;
    const complete = rows.filter((r) => r.state && r.lga && r.created_by && r.reporting_month).length;
    return Math.round((complete / rows.length) * 100);
  }, [rows]);

  return {
    rows, loading, reload,
    totals, stats, sectionTotals, genderSplit, ncBreakdown, topLgas, trend, points, dataQuality,
  };
};
