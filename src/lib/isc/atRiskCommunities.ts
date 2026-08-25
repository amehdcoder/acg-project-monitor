/**
 * At-risk community analysis for the Medicine Accountability dashboard.
 *
 * Joins two independent evidence streams:
 *   1. the Integrated MDA Supervisory Checklist — communities where the
 *      Status of MDA is "Not Started" or "Halted" AND the supervisor reported
 *      the CDD's medicines to be insufficient;
 *   2. the MDA Medicine Logistics form (Level 3, facility → CDD) — what was
 *      actually issued for those communities, to which CDD, by which facility.
 *
 * The output is the accountability contact chain a programme manager needs to
 * unblock the community: medicines issued, CDD name + phone, FLHF in-charge
 * name + phone.
 */
import type { CddTx, LogisticsDataset } from "./medicineAccountability";

const s = (v: unknown) => String(v ?? "").trim();
const key = (v: string) => s(v).toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Status codes that mean distribution is not running in the community. */
export const BLOCKED_STATUSES = new Set(["not_started", "halted"]);

/** Sufficiency answers that mean medicines were reported insufficient. */
export const INSUFFICIENT_ANSWERS = new Set([
  "no,_all_are_insufficient",
  "some_are_sufficient,_and_some_are_not",
  "no",
]);

export const STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started",
  halted: "Halted",
  ongoing: "Ongoing",
  completed: "Completed",
};

export const SUFFICIENCY_LABEL: Record<string, string> = {
  "No,_all_are_insufficient": "No — all insufficient",
  "Some_are_sufficient,_and_some_are_not": "Partially insufficient",
  "Yes,_all_are_sufficient": "Sufficient",
  No: "No",
  Yes: "Yes",
};

export interface AtRiskIssue {
  medicine: string;
  qty: number;
  batch: string;
  expiry: string;
  cdd: string;
  date: string;
}

export interface AtRiskCommunity {
  id: string;
  community: string;
  state: string;
  lga: string;
  ward: string;
  flhf: string;
  status: string;
  statusLabel: string;
  sufficiency: string;
  sufficiencyLabel: string;
  /** Free-text list of the medicines the supervisor flagged as insufficient. */
  insufficientMedicines: string;
  monitor: string;
  visitDate: string;
  /** Number of checklist submissions carrying this flag for the community. */
  reports: number;
  /** Level 3 issues recorded for this community. */
  issues: AtRiskIssue[];
  totalIssued: number;
  cdds: string[];
  cddPhones: string[];
  inCharge: string;
  inChargePhone: string;
  /** True when nothing at all was issued to the community's CDDs. */
  noMedicineIssued: boolean;
}

export type RiskFilter = "both" | "blocked" | "insufficient";

function checklistRows(cacheResults: any[]): any[] {
  return Array.isArray(cacheResults) ? cacheResults : [];
}

/**
 * Build the at-risk register.
 *
 * @param checklistResults raw KoboToolbox checklist submissions
 * @param logistics        parsed medicine logistics dataset (Level 0–4)
 * @param mode             "both" (default, spec) | "blocked" | "insufficient"
 */
export function buildAtRiskCommunities(
  checklistResults: any[],
  logistics: LogisticsDataset | null,
  mode: RiskFilter = "both",
): AtRiskCommunity[] {
  /* Level 3 issues indexed by community, then by community+facility. */
  const byCommunity = new Map<string, CddTx[]>();
  for (const tx of logistics?.cddIssues ?? []) {
    const k = key(tx.community);
    if (!k) continue;
    const list = byCommunity.get(k);
    if (list) list.push(tx); else byCommunity.set(k, [tx]);
  }

  const out = new Map<string, AtRiskCommunity>();

  for (const raw of checklistRows(checklistResults)) {
    const status = s(raw?.Status_of_MDA).toLowerCase();
    const sufficiencyRaw = s(raw?.Does_CDI_CDD_have_sufficient_d);
    const blocked = BLOCKED_STATUSES.has(status);
    const insufficient = INSUFFICIENT_ANSWERS.has(sufficiencyRaw.toLowerCase());

    const include =
      mode === "blocked" ? blocked : mode === "insufficient" ? insufficient : blocked && insufficient;
    if (!include) continue;

    const community = s(raw?.COMMUNITIES) || "Unnamed community";
    const lga = s(raw?.LGA);
    const ward = s(raw?.Ward);
    const k = `${key(community)}|${key(ward)}|${key(lga)}`;

    const existing = out.get(k);
    if (existing) {
      existing.reports += 1;
      if (s(raw?._submission_time) > existing.visitDate) {
        existing.visitDate = s(raw?._submission_time).slice(0, 10);
      }
      continue;
    }

    const matched = byCommunity.get(key(community)) ?? [];
    // Ward-scoped join: a Level 3 issue only belongs to this community when it
    // was recorded in the SAME Ward of the SAME LGA. Cross-ward records with an
    // identical community name are never folded in.
    const scoped = matched.filter(
      (t) =>
        (!lga || !t.lga || key(t.lga) === key(lga)) &&
        (!ward || !t.ward || key(t.ward) === key(ward)),
    );

    const issues: AtRiskIssue[] = scoped.map((t) => ({
      medicine: t.medicine,
      qty: t.qtyIssued,
      batch: t.batch,
      expiry: t.expiry,
      cdd: t.cddName,
      date: t.date,
    }));

    const cdds = Array.from(new Set(scoped.map((t) => s(t.cddName)).filter((v) => v && v !== "—")));
    const cddPhones = Array.from(new Set(scoped.map((t) => s(t.cddPhone)).filter(Boolean)));
    const inCharge =
      scoped.map((t) => s(t.inCharge)).find((v) => v && v !== "—") ||
      s(raw?.Health_Facility_In_Charge_Name) || "";
    const inChargePhone = scoped.map((t) => s(t.inChargePhone)).find(Boolean) || "";

    out.set(k, {
      id: k,
      community,
      state: s(raw?.State),
      lga,
      ward,
      flhf: s(raw?.FLHF) || "—",
      status,
      statusLabel: STATUS_LABEL[status] ?? (status || "—"),
      sufficiency: sufficiencyRaw,
      sufficiencyLabel: SUFFICIENCY_LABEL[sufficiencyRaw] ?? (sufficiencyRaw || "—"),
      insufficientMedicines: s(raw?.Specify_the_medicine_s_are_NOT_SUFFICIENT) || "—",
      monitor:
        s(raw?.Independent_Monitor_s_Name) || s(raw?.Name_of_Supervisor) || s(raw?.Designation) || "Unspecified",
      visitDate: s(raw?._submission_time).slice(0, 10),
      reports: 1,
      issues,
      totalIssued: issues.reduce((a, b) => a + (Number.isFinite(b.qty) ? b.qty : 0), 0),
      cdds,
      cddPhones,
      inCharge: inCharge || "—",
      inChargePhone: inChargePhone || "",
      noMedicineIssued: issues.length === 0,
    });
  }

  return Array.from(out.values()).sort(
    (a, b) =>
      Number(a.noMedicineIssued ? 0 : 1) - Number(b.noMedicineIssued ? 0 : 1) ||
      a.totalIssued - b.totalIssued ||
      a.community.localeCompare(b.community),
  );
}

export interface AtRiskSummary {
  communities: number;
  notStarted: number;
  halted: number;
  withoutIssue: number;
  unitsIssued: number;
  cdds: number;
  contactable: number;
}

export function summariseAtRisk(rows: AtRiskCommunity[]): AtRiskSummary {
  const cdds = new Set<string>();
  let contactable = 0;
  rows.forEach((r) => {
    r.cdds.forEach((c) => cdds.add(c.toLowerCase()));
    if (r.cddPhones.length || r.inChargePhone) contactable += 1;
  });
  return {
    communities: rows.length,
    notStarted: rows.filter((r) => r.status === "not_started").length,
    halted: rows.filter((r) => r.status === "halted").length,
    withoutIssue: rows.filter((r) => r.noMedicineIssued).length,
    unitsIssued: rows.reduce((a, b) => a + b.totalIssued, 0),
    cdds: cdds.size,
    contactable,
  };
}
