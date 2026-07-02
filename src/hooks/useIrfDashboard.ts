import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRowsKeyset } from "@/lib/fetchAllRowsKeyset";
import { flagDuplicates, applyOverrides, irfSignature, irfOrder, type OverrideMap } from "@/lib/acsm/irfBridge";
import { IRF_METRIC_FIELDS, IRF_SECTIONS, type IrfReport } from "@/lib/irf/definition";
import { normalizeIrfRows, computeIrfReach } from "@/lib/irf/normalize";

async function fetchAll(projectId?: string | null): Promise<IrfReport[]> {
  const rows = await fetchAllRowsKeyset<IrfReport>((limit, afterId) => {
    let q = supabase.from("irf_reports" as any).select("*");
    if (projectId) q = q.eq("project_id", projectId);
    if (afterId) q = q.gt("id", afterId);
    return q.order("id", { ascending: true }).limit(limit);
  });
  // Flatten the category-form `answers` JSON onto each row so every captured
  // field (officials engaged, announcers supervised, meetings held, …) is
  // reachable by the KPI / statistics / field-analysis computations below.
  return normalizeIrfRows(rows);
}

const num = (v: any) => (v == null || v === "" ? 0 : Number(v) || 0);

export const useIrfDashboard = (projectId?: string | null, overrideMap?: OverrideMap | null) => {
  const [rawRows, setRawRows] = useState<IrfReport[]>([]);
  const [loading, setLoading] = useState(true);
  const reqIdRef = useRef(0);

  const reload = async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    try {
      const data = await fetchAll(projectId);
      if (myReq !== reqIdRef.current) return;
      setRawRows(data);
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

  // Duplicate detection + admin overrides. Rejected submissions are dropped from all
  // analyses; "unique" overrides force-include auto-flagged rows. The remaining
  // (active) rows feed every KPI so unique counts stay authoritative.
  const dedup = useMemo(() => {
    const res = flagDuplicates(rawRows, irfSignature, (r) => r.id, irfOrder);
    return applyOverrides(res, (r) => r.id, overrideMap);
  }, [rawRows, overrideMap]);

  const rejectedIds = useMemo(() => new Set(dedup.rejected.map((r) => r.id)), [dedup]);
  const rows = useMemo(() => rawRows.filter((r) => !rejectedIds.has(r.id)), [rawRows, rejectedIds]);



  // Headline totals across all metric fields.
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    IRF_METRIC_FIELDS.forEach((f) => { t[f.key] = 0; });
    rows.forEach((r) => IRF_METRIC_FIELDS.forEach((f) => { t[f.key] += num(r[f.key]); }));
    return t;
  }, [rows]);

  const stats = useMemo(() => {
    const sum = (k: string) => rows.reduce((s, r) => s + num((r as any)[k]), 0);
    const totalReports = rows.length;
    const lgas = new Set(rows.map((r) => (r.lga || "").trim()).filter(Boolean)).size;

    // People reached = town-announcer estimated reach + radio reach + meeting/dialogue attendance.
    const peopleReached =
      sum("total_reach") + sum("radio_estimated_reach") + sum("attendance_men") + sum("attendance_women");

    // Stakeholders/officials engaged — advocacy officials (stored in `answers`)
    // plus the legacy combined-form stakeholder columns when present.
    const stakeholdersEngaged =
      sum("persons_engaged") + sum("policy_makers_engaged") + sum("traditional_leaders_engaged") +
      sum("healthcare_workers_engaged") + sum("religious_leaders_engaged") + sum("mdas_visited_count");

    const announcersSupervised = sum("announcers_supervised");

    const ncTotal = sum("noncompliance_cases");
    const ncResolved = sum("cases_resolved");
    const ncPending = sum("cases_pending");
    const ncResolutionRate = ncTotal ? Math.round((ncResolved / ncTotal) * 100) : 0;
    const hasNonCompliance = ncTotal > 0 || ncPending > 0;

    // Awareness / mobilisation touch-points actually captured by the activity forms.
    const awarenessActivities =
      sum("radio_messages_aired") + sum("town_announcements") + sum("mosque_announcements") +
      sum("iec_materials_distributed") + sum("community_dialogue_sessions") + sum("meetings_held");

    // Acceptance quality from the three-level outcome scale.
    const acceptanceAnswered = rows.filter((r) => (r as any).outcome_level).length;
    const acceptanceHigh = rows.filter((r) => (r as any).outcome_level === "High").length;
    const acceptanceHighPct = acceptanceAnswered ? Math.round((acceptanceHigh / acceptanceAnswered) * 100) : 0;

    return {
      totalReports, lgas, peopleReached, stakeholdersEngaged, announcersSupervised,
      ncTotal, ncResolved, ncResolutionRate, hasNonCompliance,
      awarenessActivities, acceptanceAnswered, acceptanceHigh, acceptanceHighPct,
    };
  }, [rows]);

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
      byLga[lga].reach +=
        num(r.total_reach) + num(r.radio_estimated_reach) + num(r.attendance_men) + num(r.attendance_women);
      byLga[lga].stakeholders +=
        num((r as any).persons_engaged) + num(r.policy_makers_engaged) + num(r.traditional_leaders_engaged) +
        num(r.healthcare_workers_engaged) + num(r.religious_leaders_engaged) + num(r.mdas_visited_count);
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
      byMonth[key].reach +=
        num(r.total_reach) + num(r.radio_estimated_reach) + num(r.attendance_men) + num(r.attendance_women);
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

  // Duplicate flagging + unique counts (override-aware; shared with the Advocacy Dashboard).
  const duplicates = useMemo(() => ({
    duplicateIds: dedup.duplicateIds,
    duplicateCount: dedup.duplicateCount,
    uniqueCount: dedup.uniqueCount,
    rejectedCount: dedup.rejectedCount,
    overriddenToUnique: dedup.overriddenToUnique,
    totalCount: rawRows.length,
  }), [dedup, rawRows.length]);

  return {
    rows, rawRows, loading, reload, duplicates,
    totals, stats, sectionTotals, genderSplit, ncBreakdown, topLgas, trend, points, dataQuality,
  };
};
