// Bridge: LGA ACSM Focal Person Indicator Reporting Form (IRF) -> Advocacy (ACSM) Dashboard
// ---------------------------------------------------------------------------------------
// The LGA ACSM Focal Person Dashboard is the PRIMARY dashboard for the IRF form and
// analyses its submissions exactly as captured. This bridge performs the SECONDARY
// analysis that lets IRF submissions (and the related ACSM Indicator Reporting Form)
// contribute to the KPIs / widgets / insights of the Advocacy Dashboard.
//
// Mapping rationale (IndiKit Advocacy guidance — indikit.net/sector/1012-advocacy):
//   • Engagement with Decision Makers  = MDA visits + state-level advocacy meetings +
//                                        emirate council meetings + policy makers engaged
//   • Support of Influential Stakeholders = traditional + religious + healthcare leaders
//   • People Reached                   = total reach + radio reach + dialogue attendance
//   • Media Coverage                   = radio messages + town + mosque announcements
//   • Policy / Public Events           = community dialogue sessions
//   • Papers Published & Disseminated  = IEC materials distributed
//   • Adopted Recommendations (result) = non-compliance cases resolved through advocacy
//
// Each contribution becomes a synthetic AcsmRow so the existing Advocacy Dashboard
// aggregations keep working unchanged. Contributions are treated as delivered outputs
// (target = actual => "on track"), which is the correct interpretation for completed
// field activities that have no separate numeric target in the IRF.

import type { AcsmRow } from "@/hooks/useAcsmDashboard";
import type { IrfReport } from "@/lib/irf/definition";

const num = (v: any) => (v == null || v === "" ? 0 : Number(v) || 0);

interface IrfMapEntry {
  indicator: string;
  category: string;
  unit: string;
  level: string;
  /** Sum these IRF metric keys into the contributed actual value. */
  keys: string[];
}

export const IRF_TO_ACSM_MAP: IrfMapEntry[] = [
  {
    indicator: "engagement_decision_makers",
    category: "stakeholder_engagement",
    unit: "number_of_engagements",
    level: "output",
    keys: ["mdas_visited_count", "state_advocacy_meetings", "emirate_council_meetings", "policy_makers_engaged"],
  },
  {
    indicator: "support_influential_stakeholders",
    category: "stakeholder_engagement",
    unit: "number_of_people",
    level: "outcome",
    keys: ["traditional_leaders_engaged", "religious_leaders_engaged", "healthcare_workers_engaged"],
  },
  {
    indicator: "people_reached",
    category: "stakeholder_engagement",
    unit: "number_of_people",
    level: "output",
    keys: ["total_reach", "radio_estimated_reach", "attendance_men", "attendance_women"],
  },
  {
    indicator: "media_coverage",
    category: "stakeholder_engagement",
    unit: "number_of_mentions",
    level: "output",
    keys: ["radio_messages_aired", "town_announcements", "mosque_announcements"],
  },
  {
    indicator: "policy_public_events",
    category: "stakeholder_engagement",
    unit: "number_of_events",
    level: "output",
    keys: ["community_dialogue_sessions"],
  },
  {
    indicator: "papers_published",
    category: "stakeholder_engagement",
    unit: "number_of_documents",
    level: "output",
    keys: ["iec_materials_distributed"],
  },
  {
    indicator: "adopted_recommendations",
    category: "results_of_advocacy",
    unit: "number_of_documents",
    level: "outcome",
    keys: ["cases_resolved"],
  },
];

/** Convert a single IRF report into one synthetic AcsmRow per non-zero mapped indicator. */
export function mapIrfRowToAcsmRows(r: IrfReport): AcsmRow[] {
  const out: AcsmRow[] = [];
  for (const m of IRF_TO_ACSM_MAP) {
    const actual = m.keys.reduce((s, k) => s + num((r as any)[k]), 0);
    if (actual <= 0) continue;
    out.push({
      id: `irf:${r.id}:${m.indicator}`,
      reporting_period: r.reporting_month || r.reporting_period || null,
      reporting_level: "lga",
      state: r.state ?? null,
      lga: r.lga ?? null,
      ward: r.ward ?? null,
      community: null,
      category: m.category,
      indicator: m.indicator,
      indicator_level: m.level,
      unit_of_measure: m.unit,
      target_value: actual, // delivered output => 100% (on track)
      actual_achieved: actual,
      achievement_pct: 100,
      status: "on_track",
      responsible_officer: r.focal_person_name || "LGA ACSM Focal Person",
      data_source: "LGA ACSM Focal Person IRF",
      date_reported: (r.reporting_month || r.created_at || "").slice(0, 10) || null,
      stakeholder_type: null,
      engagement_type: null,
      communication_channel: null,
      reach_type: null,
      female_count: m.indicator === "people_reached" ? num((r as any).attendance_women) : null,
      male_count: m.indicator === "people_reached" ? num((r as any).attendance_men) : null,
      age_under18: null,
      age_18_35: null,
      age_35_plus: null,
      narrative_progress: r.narrative ?? null,
      contribution_story: null,
      key_challenges: null,
      actions_next_steps: null,
      evidence: Array.isArray(r.evidence) ? r.evidence : null,
      gps_lat: r.gps_lat ?? null,
      gps_lng: r.gps_lng ?? null,
      submission_status: r.submission_status ?? null,
      created_at: r.created_at,
      // marker used for duplicate flagging / source attribution
      _source: "irf",
    } as AcsmRow & { _source: string });
  }
  return out;
}

export function mapIrfRowsToAcsmRows(rows: IrfReport[]): AcsmRow[] {
  return rows.flatMap(mapIrfRowToAcsmRows);
}

// ---------------------------------------------------------------------------------------
// Duplicate flagging & unique counts (shared by the IRF + Advocacy dashboards).
// A submission is considered a duplicate of an earlier one when it shares the same
// reporter, reporting month and geography AND the same aggregate metric signature.
// ---------------------------------------------------------------------------------------

export interface DuplicateResult<T> {
  unique: T[];
  duplicates: T[];
  duplicateIds: Set<string>;
  /** signature -> rows that share it (length > 1 means duplicates exist) */
  groups: Map<string, T[]>;
  duplicateCount: number;
  uniqueCount: number;
}

export function flagDuplicates<T>(
  rows: T[],
  sigFn: (row: T) => string,
  idFn: (row: T) => string,
  orderFn?: (row: T) => number,
): DuplicateResult<T> {
  const sorted = orderFn ? [...rows].sort((a, b) => orderFn(a) - orderFn(b)) : rows;
  const groups = new Map<string, T[]>();
  for (const row of sorted) {
    const sig = sigFn(row);
    const arr = groups.get(sig);
    if (arr) arr.push(row);
    else groups.set(sig, [row]);
  }
  const unique: T[] = [];
  const duplicates: T[] = [];
  const duplicateIds = new Set<string>();
  for (const arr of groups.values()) {
    // first occurrence is the authoritative one; the rest are duplicates
    unique.push(arr[0]);
    for (let i = 1; i < arr.length; i++) {
      duplicates.push(arr[i]);
      duplicateIds.add(idFn(arr[i]));
    }
  }
  return {
    unique,
    duplicates,
    duplicateIds,
    groups,
    duplicateCount: duplicates.length,
    uniqueCount: unique.length,
  };
}

const norm = (v: any) => String(v ?? "").trim().toLowerCase();

/** Signature for an IRF report (used on the LGA ACSM Focal Person Dashboard). */
export function irfSignature(r: IrfReport): string {
  const metricSum = IRF_TO_ACSM_MAP.flatMap((m) => m.keys)
    .reduce((s, k) => s + num((r as any)[k]), 0);
  return [
    norm(r.created_by),
    norm(r.reporting_month || r.reporting_period),
    norm(r.state),
    norm(r.lga),
    norm(r.ward),
    metricSum,
  ].join("|");
}

export function irfOrder(r: IrfReport): number {
  return new Date(r.created_at || 0).getTime();
}
