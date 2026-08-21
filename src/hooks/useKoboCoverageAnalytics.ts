/**
 * Reactive coverage analytics for the Household Survey Coverage section of the
 * Integrated MDA Supervisory Checklist dashboard.
 *
 * Everything is derived live from the flattened KoboToolbox respondent records:
 * offered / swallowed / uptake / unmet-need rates, cluster design effect (DEFF),
 * intra-cluster correlation (ICC ρ), margin of error, per-administrative-level
 * aggregation with WASH cross-analysis, and a mathematical consistency report.
 */
import { useMemo } from "react";
import {
  COVERAGE_INDICATORS, communityKey, coverageByLevel, coverageTargetFor, coverageTargetForMany,
  estimateIndicator, reasonBreakdown,
  type CoverageEstimate, type CoverageLevel, type CoverageRow, type Row,
} from "@/lib/isc/householdCoverage";
import { resolveChecklistValue } from "@/components/IntegratedSupervisory/checklistSchema";
import { validate, type ValidationReport } from "@/lib/isc/chartValidation";

export interface CoverageFilters {
  campaign?: string | null;
  /** Free-text search applied to the administrative table. */
  search?: string;
}

export type WashRisk = "critical" | "reinfection" | "controlled" | "watch" | "none";

export interface AdminUnitRow {
  key: string;
  name: string;
  parentPath: string;
  clusters: number;
  households: number;
  /** Epidemiological coverage % (0–100). */
  coveragePct: number | null;
  offeredPct: number | null;
  uptakePct: number | null;
  ciLow: number;
  ciHigh: number;
  marginPct: number;
  lowPower: boolean;
  washPct: number | null;
  openDefecationPct: number | null;
  washRisk: WashRisk;
  topReason: string | null;
  /** Programme coverage threshold (%) for this unit's campaign type(s). */
  targetPct: number;
  /** Campaign type(s) behind the target, for tooltips. */
  targetLabel: string;
  /** True when the unit mixes campaign types with different thresholds. */
  mixedTargets: boolean;
  estimates: Record<string, CoverageEstimate>;
}

export interface CoverageStats {
  totalN: number;
  clusters: number;
  offeredCount: number;
  offeredDen: number;
  offeredPct: number;
  swallowedCount: number;
  swallowedPct: number;
  uptakePct: number;
  unmetNeedPct: number;
  gapPct: number;
  gapCount: number;
  deff: number;
  icc: number;
  marginOfError: number;
  effectiveSample: number;
  unreachedClusterCount: number;
  /** Programme coverage threshold (%) applied to the current campaign filter. */
  targetPct: number;
  lowestLgaName: string;
  lowestLgaPct: number | null;
  improvedWaterPct: number | null;
  improvedLatrinePct: number | null;
  openDefecationPct: number | null;
}

export interface KoboCoverageAnalytics {
  rows: Row[];
  stats: CoverageStats;
  overall: Record<string, CoverageEstimate>;
  table: AdminUnitRow[];
  refusalReasons: { name: string; value: number }[];
  acceptReasons: { name: string; value: number }[];
  validation: ValidationReport;
  showClusterAlert: boolean;
  /** Aggregation for any administrative level (memoised per level). */
  levelTable: (level: CoverageLevel) => AdminUnitRow[];
}

const rate = (x: number, n: number) => (n > 0 ? (x / n) * 100 : 0);
const asPct = (e?: CoverageEstimate) => (e && e.n > 0 ? e.p * 100 : null);

/** Primary reported reason for non-coverage inside a group of respondents. */
function primaryNonCoverageReason(group: Row[]): string | null {
  const notOffered = group.filter(
    (r) => String(r.Were_you_OFFERED_the_medicine_s ?? "").trim() === "Not_offered_any_required_1",
  ).length;
  const refusal = reasonBreakdown(group, "Reason_respondent_DID_NOT_SWAL");
  const top = refusal[0];
  if (notOffered > (top?.value ?? 0)) return `Never offered the medicine (${notOffered} household(s))`;
  if (top) return `${top.name} (${top.value} household(s))`;
  return null;
}

function riskOf(coveragePct: number | null, washPct: number | null, targetPct = 80): WashRisk {
  if (coveragePct == null || washPct == null) return "none";
  const highCov = coveragePct >= targetPct;
  const highWash = washPct >= 50;
  if (highCov && !highWash) return "reinfection";
  if (!highCov && !highWash) return "critical";
  if (highCov && highWash) return "controlled";
  return "watch";
}

export function useKoboCoverageAnalytics(
  submissions: Row[],
  filters: CoverageFilters = {},
): KoboCoverageAnalytics {
  const campaign = filters.campaign ?? null;

  const rows = useMemo(() => {
    if (!campaign) return submissions;
    return submissions.filter(
      (r) => resolveChecklistValue("MDA_Campaign_Type", r.MDA_Campaign_Type) === campaign,
    );
  }, [submissions, campaign]);

  const overall = useMemo(() => {
    const m: Record<string, CoverageEstimate> = {};
    for (const ind of COVERAGE_INDICATORS) m[ind.key] = estimateIndicator(rows, ind);
    return m;
  }, [rows]);

  const lgaRows = useMemo(() => coverageByLevel(rows, "LGA"), [rows]);
  const communityRows = useMemo(() => coverageByLevel(rows, "Community"), [rows]);

  const stats = useMemo<CoverageStats>(() => {
    const epi = overall.epi_coverage;
    const offered = overall.offered;
    const uptake = overall.swallowed_of_offered;

    const totalN = rows.length;
    const offeredDen = offered?.n ?? 0;
    const offeredCount = offered?.x ?? 0;
    const swallowedCount = epi?.x ?? 0;
    const offeredPct = rate(offeredCount, offeredDen);
    const swallowedPct = rate(swallowedCount, epi?.n ?? 0);
    const uptakePct = uptake && uptake.n > 0 ? uptake.p * 100 : 0;
    const unmetNeedPct = offeredDen > 0 ? 100 - offeredPct : 0;

    const targetPct = coverageTargetFor(campaign);
    const gapPct = epi && epi.n > 0 ? Math.max(0, targetPct - swallowedPct) : 0;
    const gapCount = epi ? Math.max(0, epi.n - epi.x) : 0;

    // Clusters where nobody swallowed / nobody was reached.
    const unreachedClusterCount = communityRows.filter((c) => {
      const e = c.estimates.epi_coverage;
      return e && e.n > 0 && e.p < 0.65;
    }).length;

    const withData = lgaRows.filter((l) => (l.estimates.epi_coverage?.n ?? 0) > 0);
    const lowest = withData
      .slice()
      .sort((a, b) => a.estimates.epi_coverage.p - b.estimates.epi_coverage.p)[0];

    const clusterIds = new Set(rows.map(communityKey));

    return {
      totalN,
      clusters: clusterIds.size,
      offeredCount,
      offeredDen,
      offeredPct,
      swallowedCount,
      swallowedPct,
      uptakePct,
      unmetNeedPct,
      gapPct,
      gapCount,
      deff: epi?.deff ?? 1,
      icc: epi?.icc ?? 0,
      marginOfError: epi?.marginPct ?? 0,
      effectiveSample: epi && epi.deff > 0 ? Math.round((epi.n || totalN) / epi.deff) : totalN,
      unreachedClusterCount,
      targetPct,
      lowestLgaName: lowest?.name ?? "—",
      lowestLgaPct: lowest ? lowest.estimates.epi_coverage.p * 100 : null,
      improvedWaterPct: asPct(overall.improved_water),
      improvedLatrinePct: asPct(overall.improved_sanitation),
      openDefecationPct: asPct(overall.open_defecation),
    };
  }, [rows, overall, lgaRows, communityRows, campaign]);

  const buildTable = (source: CoverageRow[]): AdminUnitRow[] =>
    source.map((r) => {
      const epi = r.estimates.epi_coverage;
      const coveragePct = asPct(epi);
      const water = asPct(r.estimates.improved_water);
      const latrine = asPct(r.estimates.improved_sanitation);
      const washPct =
        water == null && latrine == null ? null : ((water ?? 0) + (latrine ?? 0)) / (water != null && latrine != null ? 2 : 1);
      const target = campaign
        ? { target: coverageTargetFor(campaign), mixed: false, label: campaign }
        : coverageTargetForMany(r.campaigns);
      return {
        key: r.key,
        name: r.name,
        parentPath: [r.parent, r.grandParent].filter(Boolean).join(" · ") || "—",
        clusters: r.communities,
        households: r.respondents,
        coveragePct,
        offeredPct: asPct(r.estimates.offered),
        uptakePct: asPct(r.estimates.swallowed_of_offered),
        ciLow: (epi?.ciLow ?? 0) * 100,
        ciHigh: (epi?.ciHigh ?? 0) * 100,
        marginPct: epi?.marginPct ?? 0,
        lowPower: r.communities < 5 || (epi?.marginPct ?? 0) > 10,
        washPct,
        openDefecationPct: asPct(r.estimates.open_defecation),
        washRisk: riskOf(coveragePct, washPct, target.target),
        topReason: coveragePct != null && coveragePct < target.target ? primaryNonCoverageReason([]) : null,
        targetPct: target.target,
        targetLabel: target.label,
        mixedTargets: target.mixed,
        estimates: r.estimates,
      };
    });

  // Table is rebuilt per level by the consumer through `levelTable`.
  const levelCache = useMemo(() => {
    const cache: Partial<Record<CoverageLevel, AdminUnitRow[]>> = {};
    return {
      get(level: CoverageLevel): AdminUnitRow[] {
        if (!cache[level]) {
          const source = level === "LGA" ? lgaRows : level === "Community" ? communityRows : coverageByLevel(rows, level);
          const groups = new Map<string, Row[]>();
          const keys: Record<CoverageLevel, string[]> = {
            State: ["State"], LGA: ["State", "LGA"],
            Ward: ["State", "LGA", "Ward"], Community: ["State", "LGA", "Ward", "COMMUNITIES"],
          };
          for (const r of rows) {
            const parts = keys[level].map((k) => String(r[k] ?? "").trim());
            if (!parts[parts.length - 1]) continue;
            const k = parts.join(" › ");
            groups.set(k, [...(groups.get(k) ?? []), r]);
          }
          cache[level] = buildTable(source).map((row) => ({
            ...row,
            topReason:
              row.coveragePct != null && row.coveragePct < row.targetPct
                ? primaryNonCoverageReason(groups.get(row.key) ?? [])
                : null,
          }));
        }
        return cache[level]!;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, lgaRows, communityRows]);

  const table = useMemo(() => levelCache.get("Ward"), [levelCache]);

  const refusalReasons = useMemo(() => reasonBreakdown(rows, "Reason_respondent_DID_NOT_SWAL"), [rows]);
  const acceptReasons = useMemo(() => reasonBreakdown(rows, "Reason_respondent_SWALLOWED_th"), [rows]);

  const validation = useMemo(() => {
    const v = validate();
    const epi = overall.epi_coverage;
    const offered = overall.offered;
    const notOffered = overall.not_offered;
    const uptake = overall.swallowed_of_offered;

    v.rate("Offered rate", offered?.x ?? 0, offered?.n ?? 0, stats.offeredDen ? stats.offeredPct : null);
    v.rate("Epidemiological coverage", epi?.x ?? 0, epi?.n ?? 0, epi?.n ? stats.swallowedPct : null);
    v.rate("Uptake / adherence", uptake?.x ?? 0, uptake?.n ?? 0, uptake?.n ? stats.uptakePct : null);
    v.complementary("Offered vs unmet need", stats.offeredDen ? stats.offeredPct : null, stats.offeredDen ? stats.unmetNeedPct : null);
    v.complementary(
      "Offered vs not offered",
      offered?.n ? offered.p * 100 : null,
      notOffered?.n ? notOffered.p * 100 : null,
    );
    v.atMost(
      "Swallowed ≤ offered",
      epi?.x ?? 0,
      offered?.x ?? 0,
      "More respondents swallowed medicine than were offered it.",
    );
    v.sample("Statistical sampling strip", epi?.n ?? 0, epi?.clusters ?? 0, stats.deff);
    v.distribution("Reasons for NOT swallowing", refusalReasons, rows.length);
    v.distribution("Reasons for swallowing", acceptReasons, rows.length);
    v.stacked(
      "Administrative ranking",
      table.map((r) => ({
        name: r.name,
        parts: [r.estimates.epi_coverage?.x ?? 0, (r.estimates.epi_coverage?.n ?? 0) - (r.estimates.epi_coverage?.x ?? 0)],
        total: r.estimates.epi_coverage?.n ?? 0,
      })),
    );
    v.stacked(
      "Sample size reconciliation",
      [{ name: "All administrative units", parts: table.map((r) => r.households), total: table.reduce((s, r) => s + r.households, 0) }],
    );
    return v.report();
  }, [overall, stats, refusalReasons, acceptReasons, table, rows.length]);

  return {
    rows,
    stats,
    overall,
    table,
    refusalReasons,
    acceptReasons,
    validation,
    showClusterAlert: stats.icc > 0.35 && stats.gapPct > 2,
    levelTable: (l: CoverageLevel) => levelCache.get(l),
  };
}

export default useKoboCoverageAnalytics;
