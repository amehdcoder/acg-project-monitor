/**
 * Personnel accountability — SLOs, EDOs, FLHF in-charges and CDDs.
 * ─────────────────────────────────────────────────────────────────────────
 * Rolls the Medicine Allocation & Accountability logistics dataset up by the
 * PERSON responsible at each tier and scores how accountable they were:
 *
 *   Documentation  — waybills, signatures and proof-of-delivery photos.
 *   Onward flow    — how much of what they held actually moved to the next tier.
 *   Stock integrity— damage / loss free share of the units they touched.
 *
 *   Score = 100 × (0.40·documentation + 0.40·onward flow + 0.20·integrity)
 *
 * Spelling variants of the same person are fuzzy-resolved (per role) with the
 * shared identity index so aggregates never split across "AKRAM ABDULRAHMAN"
 * and "Akram Abdurrahman".
 */
import type { LogisticsDataset } from "./medicineAccountability";
import { buildIdentityIndex } from "./actorIdentity";
import { isHumanName, isCommunityName } from "./nameQuality";

export type PersonnelRole = "SLO" | "EDO" | "FLHF" | "CDD";

export const ROLE_LABELS: Record<PersonnelRole, string> = {
  SLO: "State Logistic Officer (SLO)",
  EDO: "LGA EDO / Logistic Officer",
  FLHF: "FLHF In-charge",
  CDD: "Community-Directed Distributor (CDD)",
};

export interface PersonnelRow {
  name: string;
  role: PersonnelRole;
  states: string[];
  lgas: string[];
  wards: string[];
  facilities: string[];
  communities: string[];
  communityCount: number;
  transactions: number;
  unitsHandled: number;
  unitsOnward: number;
  unitsLost: number;
  documentation: number; // 0–1
  onward: number;        // 0–1
  integrity: number;     // 0–1
  score: number;         // 0–100
  band: "Strong" | "Adequate" | "At risk" | "Critical";
  firstDate: string;
  lastDate: string;
  activeDays: number;
}

export interface PersonnelAccountability {
  rows: PersonnelRow[];
  byRole: Record<PersonnelRole, PersonnelRow[]>;
  totals: {
    people: number;
    communities: number;
    unitsHandled: number;
    avgScore: number;
  };
}

const band = (s: number): PersonnelRow["band"] =>
  s >= 85 ? "Strong" : s >= 70 ? "Adequate" : s >= 50 ? "At risk" : "Critical";

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

interface Acc {
  name: string;
  role: PersonnelRole;
  states: Set<string>; lgas: Set<string>; wards: Set<string>;
  facilities: Set<string>; communities: Set<string>; days: Set<string>;
  tx: number;
  docHits: number; docChecks: number;
  handled: number; onward: number; lost: number;
  first: string; last: string;
}

const mk = (name: string, role: PersonnelRole): Acc => ({
  name, role,
  states: new Set(), lgas: new Set(), wards: new Set(),
  facilities: new Set(), communities: new Set(), days: new Set(),
  tx: 0, docHits: 0, docChecks: 0, handled: 0, onward: 0, lost: 0,
  first: "", last: "",
});

const touchGeo = (a: Acc, t: { state?: string; lga?: string; ward?: string; date?: string }) => {
  if (t.state) a.states.add(String(t.state).trim());
  if (t.lga) a.lgas.add(String(t.lga).trim());
  if (t.ward) a.wards.add(String(t.ward).trim());
  const d = String(t.date ?? "").slice(0, 10);
  if (d) {
    a.days.add(d);
    if (!a.first || d < a.first) a.first = d;
    if (!a.last || d > a.last) a.last = d;
  }
};

/**
 * Build the per-person accountability rows for every tier of the cascade.
 */
export function computePersonnelAccountability(ds: LogisticsDataset): PersonnelAccountability {
  // Fuzzy identity index per role, so variants collapse into one canonical name.
  const namesFor = (role: PersonnelRole): string[] => {
    switch (role) {
      case "SLO":
        return [...ds.dispatches.map((d) => d.sloName), ...ds.receipts.map((r) => r.sloName)];
      case "EDO":
        return [...ds.receipts.map((r) => r.edoName), ...ds.dispatches.map((d) => d.receivingOfficer)];
      case "FLHF":
        return ds.issues.map((i) => i.inCharge);
      default:
        return ds.cddIssues.map((c) => c.cddName);
    }
  };
  const indexes = new Map<PersonnelRole, ReturnType<typeof buildIdentityIndex>>();
  (["SLO", "EDO", "FLHF", "CDD"] as PersonnelRole[]).forEach((r) =>
    indexes.set(r, buildIdentityIndex(namesFor(r).filter(isHumanName))),
  );

  const canon = (role: PersonnelRole, raw: unknown): string => {
    if (!isHumanName(raw)) return "";
    const v = String(raw).trim();
    return indexes.get(role)?.resolve(v)?.name || v;
  };

  const map = new Map<string, Acc>();
  const get = (role: PersonnelRole, name: string): Acc => {
    const k = `${role}|${name.toLowerCase()}`;
    let a = map.get(k);
    if (!a) { a = mk(name, role); map.set(k, a); }
    return a;
  };

  /* Level 0 — SLO dispatches from the state store. */
  for (const d of ds.dispatches) {
    const name = canon("SLO", d.sloName);
    if (!name) continue;
    const a = get("SLO", name);
    touchGeo(a, { state: d.state, lga: d.destinationLga || d.lga, ward: d.ward, date: d.date });
    a.tx += 1;
    a.docChecks += 2;
    a.docHits += (d.hasWaybill ? 1 : 0) + (d.hasSignature ? 1 : 0);
    a.handled += d.qtyDispatched;
    a.onward += Math.max(0, d.qtyDispatched - d.qtyDamaged);
    a.lost += d.qtyDamaged;
  }

  /* Level 1 — EDO receipts at the LGA store. */
  for (const r of ds.receipts) {
    const name = canon("EDO", r.edoName);
    if (!name) continue;
    const a = get("EDO", name);
    touchGeo(a, { state: r.state, lga: r.lga, ward: r.ward, date: r.date });
    a.tx += 1;
    a.docChecks += 2;
    a.docHits += (r.hasWaybill ? 1 : 0) + (r.hasSignature ? 1 : 0);
    a.handled += r.netUsable || Math.max(0, r.qtyReceived - r.qtyDamaged);
    a.lost += r.qtyDamaged;
  }

  /* Level 2 — EDO issues down to facilities (onward flow for the EDO,
     receipt evidence for the FLHF in-charge). */
  const edoByLga = new Map<string, string>();
  for (const r of ds.receipts) {
    const n = canon("EDO", r.edoName);
    if (n) edoByLga.set(`${r.state}|${r.lga}`.toLowerCase(), n);
  }
  for (const i of ds.issues) {
    const edo = edoByLga.get(`${i.state}|${i.lga}`.toLowerCase()) || canon("EDO", i.submittedBy);
    if (edo) {
      const a = get("EDO", edo);
      touchGeo(a, { state: i.state, lga: i.lga, ward: i.ward, date: i.date });
      if (i.facility) a.facilities.add(i.facility.trim());
      a.onward += i.qtyIssued;
    }
    const inCharge = canon("FLHF", i.inCharge);
    if (!inCharge) continue;
    const f = get("FLHF", inCharge);
    touchGeo(f, { state: i.state, lga: i.lga, ward: i.ward, date: i.date });
    if (i.facility) f.facilities.add(i.facility.trim());
    f.tx += 1;
    f.docChecks += 1;
    f.docHits += i.hasSignature ? 1 : 0;
    f.handled += i.qtyIssued;
  }

  /* Level 3 — CDD issues into the communities. */
  const flhfByFacility = new Map<string, string>();
  for (const i of ds.issues) {
    const n = canon("FLHF", i.inCharge);
    if (n && i.facility) flhfByFacility.set(i.facility.trim().toLowerCase(), n);
  }
  for (const c of ds.cddIssues) {
    const facilityKey = String(c.facility ?? "").trim().toLowerCase();
    const inCharge = flhfByFacility.get(facilityKey);
    if (inCharge) {
      const f = get("FLHF", inCharge);
      f.onward += c.qtyIssued;
      if (isCommunityName(c.community)) f.communities.add(String(c.community).trim());
    }
    const name = canon("CDD", c.cddName);
    if (!name) continue;
    const a = get("CDD", name);
    touchGeo(a, { state: c.state, lga: c.lga, ward: c.ward, date: c.date });
    if (c.facility) a.facilities.add(String(c.facility).trim());
    if (isCommunityName(c.community)) a.communities.add(String(c.community).trim());
    a.tx += 1;
    a.docChecks += 2;
    a.docHits += (c.hasPhoto ? 1 : 0) + (isCommunityName(c.community) ? 1 : 0);
    a.handled += c.qtyIssued;
    a.onward += c.qtyIssued;
  }

  /* Level 4 — returns: damaged / expired stock counts against the returner. */
  for (const r of ds.returns) {
    for (const role of ["SLO", "EDO", "FLHF", "CDD"] as PersonnelRole[]) {
      const name = canon(role, r.returnedBy);
      const k = `${role}|${name.toLowerCase()}`;
      if (!name || !map.has(k)) continue;
      const a = map.get(k)!;
      a.docChecks += 1;
      a.docHits += r.hasWaybill || r.hasSignature ? 1 : 0;
      a.lost += r.qtyDamaged + r.qtyExpired;
    }
  }

  const rows: PersonnelRow[] = [...map.values()].map((a) => {
    const documentation = a.docChecks ? clamp01(a.docHits / a.docChecks) : 0;
    const onward = a.handled ? clamp01(a.onward / a.handled) : a.tx ? 0.5 : 0;
    const integrity = a.handled ? clamp01(1 - a.lost / a.handled) : 1;
    const score = Math.round((0.4 * documentation + 0.4 * onward + 0.2 * integrity) * 1000) / 10;
    return {
      name: a.name,
      role: a.role,
      states: [...a.states].sort(),
      lgas: [...a.lgas].sort(),
      wards: [...a.wards].sort(),
      facilities: [...a.facilities].sort(),
      communities: [...a.communities].sort(),
      communityCount: a.communities.size,
      transactions: a.tx,
      unitsHandled: a.handled,
      unitsOnward: a.onward,
      unitsLost: a.lost,
      documentation, onward, integrity,
      score,
      band: band(score),
      firstDate: a.first,
      lastDate: a.last,
      activeDays: a.days.size,
    };
  })
    .sort((x, y) => y.score - x.score || y.communityCount - x.communityCount);

  const byRole = { SLO: [], EDO: [], FLHF: [], CDD: [] } as Record<PersonnelRole, PersonnelRow[]>;
  for (const r of rows) byRole[r.role].push(r);

  const communities = new Set<string>();
  for (const r of rows) r.communities.forEach((c) => communities.add(c.toLowerCase()));

  return {
    rows,
    byRole,
    totals: {
      people: rows.length,
      communities: communities.size,
      unitsHandled: rows.reduce((s, r) => s + r.unitsHandled, 0),
      avgScore: rows.length ? rows.reduce((s, r) => s + r.score, 0) / rows.length : 0,
    },
  };
}

export default computePersonnelAccountability;
