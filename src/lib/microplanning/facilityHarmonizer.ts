/**
 * GRID3 health-facility name harmonisation.
 * ─────────────────────────────────────────────────────────────────────────
 * Field teams spell the same facility many ways ("Kofar Gabas PHC",
 * "kofar gabas primary health centre", "K/Gabas Health Post"). This module
 * standardises `flhf_name` GLOBALLY across the Geo Microplanning page by
 * fuzzy-matching every distinct spelling — strictly inside the reported
 * State → LGA → Ward — against the GRID3 health-facility registry.
 *
 * Two passes, in order:
 *   1. GRID3 canon — a spelling that clears the confidence bar against a GRID3
 *      facility inside its ward (then inside its LGA) adopts the GRID3 name.
 *   2. Local consensus — remaining spellings in the same ward that are fuzzily
 *      identical to each other collapse onto the most frequently captured
 *      variant, so the list is still internally consistent where GRID3 has no
 *      record.
 *
 * Purely offline: reads the GRID3 shards already cached on the device.
 */

import {
  getGrid3FacilitiesWithCoords,
  type FacilityWithCoords,
} from "@/lib/grid3NigeriaData";
import { normName, similarity, facilitySimilarity, facilityCore } from "./settlementResolver";

export type HarmonizeSource = "grid3_ward" | "grid3_lga" | "local_consensus";

export interface FacilityRename {
  state: string;
  lga: string;
  ward: string;
  /** The spelling as captured in the field. */
  from: string;
  /** The standardised spelling every matching record will adopt. */
  to: string;
  confidence: number;
  source: HarmonizeSource;
  /** Ids of the microplan entries carrying `from` in this ward. */
  ids: string[];
  recordCount: number;
}

/** A ward-scoped facility spelling GRID3 has no record of. */
export interface UnmatchedFacility {
  state: string;
  lga: string;
  ward: string;
  /** The name as it will stand after harmonisation (cluster winner). */
  name: string;
  ids: string[];
  recordCount: number;
  /** Closest GRID3 facility in the ward and how close it was (below threshold). */
  nearest: string | null;
  nearestScore: number;
  /** Every GRID3 facility registered in this ward, for manual assignment. */
  grid3Options: string[];
}

export interface HarmonizeResult {
  renames: FacilityRename[];
  /** Distinct ward-scoped facility spellings inspected. */
  inspected: number;
  /** Spellings already standard (exact GRID3 match or already canonical). */
  alreadyStandard: number;
  recordsAffected: number;
  /** Facilities captured in the field that GRID3 does not know — need a decision. */
  unmatched: UnmatchedFacility[];
}


export interface HarmonizeRow {
  id?: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  flhf_name?: string | null;
}

/** Confidence floor for adopting a GRID3 spelling. */
export const GRID3_NAME_THRESHOLD = 0.82;
/** Confidence floor for collapsing two field spellings onto each other. */
export const LOCAL_NAME_THRESHOLD = 0.88;

const titleCase = (s: string) =>
  s.replace(/\s+/g, " ").trim();

function bestFacility(name: string, pool: FacilityWithCoords[]) {
  let best: { rec: FacilityWithCoords; score: number } | null = null;
  for (const rec of pool) {
    if (!rec?.name) continue;
    const score = facilitySimilarity(name, rec.name);
    if (!best || score > best.score) best = { rec, score };
  }
  return best;
}

/**
 * Compute the standardising renames for a set of microplan rows.
 * Never mutates the input; the caller decides whether to persist.
 */
export async function harmonizeFacilityNames(
  rows: HarmonizeRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<HarmonizeResult> {
  // Group rows by State|LGA|Ward → spelling → ids
  type Ward = { state: string; lga: string; ward: string; names: Map<string, string[]> };
  const wards = new Map<string, Ward>();

  for (const r of rows) {
    const state = String(r.state ?? "").trim();
    const lga = String(r.lga ?? "").trim();
    const ward = String(r.ward ?? "").trim();
    const name = titleCase(String(r.flhf_name ?? ""));
    if (!state || !lga || !ward || !name) continue;
    const key = `${state}||${lga}||${ward}`;
    if (!wards.has(key)) wards.set(key, { state, lga, ward, names: new Map() });
    const bucket = wards.get(key)!;
    if (!bucket.names.has(name)) bucket.names.set(name, []);
    if (r.id) bucket.names.get(name)!.push(String(r.id));
  }

  const renames: FacilityRename[] = [];
  let inspected = 0;
  let alreadyStandard = 0;
  let recordsAffected = 0;

  const list = Array.from(wards.values());
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    const [facWard, facLga] = await Promise.all([
      getGrid3FacilitiesWithCoords(w.state, w.lga, w.ward).catch(() => []),
      getGrid3FacilitiesWithCoords(w.state, w.lga).catch(() => []),
    ]);

    // Pass 1 — GRID3 canon.
    const unmatched: Array<{ name: string; ids: string[] }> = [];
    const canonical = new Map<string, string>(); // normalised → canonical spelling

    for (const [name, ids] of w.names) {
      inspected++;
      const inWard = bestFacility(name, facWard);
      const inLga = inWard && inWard.score >= GRID3_NAME_THRESHOLD ? null : bestFacility(name, facLga);
      const pick =
        inWard && inWard.score >= GRID3_NAME_THRESHOLD
          ? { rec: inWard.rec, score: inWard.score, source: "grid3_ward" as HarmonizeSource }
          : inLga && inLga.score >= GRID3_NAME_THRESHOLD
            ? { rec: inLga.rec, score: inLga.score, source: "grid3_lga" as HarmonizeSource }
            : null;

      if (pick) {
        const to = titleCase(pick.rec.name);
        canonical.set(normName(to), to);
        if (normName(to) === normName(name) && to === name) {
          alreadyStandard++;
          continue;
        }
        renames.push({
          state: w.state, lga: w.lga, ward: w.ward,
          from: name, to,
          confidence: Math.round(pick.score * 100) / 100,
          source: pick.source,
          ids, recordCount: ids.length,
        });
        recordsAffected += ids.length;
      } else {
        unmatched.push({ name, ids });
      }
    }

    // Pass 2 — local consensus among the spellings GRID3 could not canonise.
    const clusters: Array<{ variants: Array<{ name: string; ids: string[] }> }> = [];
    for (const item of unmatched) {
      // Fold into an existing GRID3 canon first (e.g. abbreviation of a name
      // another record already standardised in this ward).
      let folded = false;
      for (const canon of canonical.values()) {
        if (facilitySimilarity(item.name, canon) >= LOCAL_NAME_THRESHOLD) {
          if (canon !== item.name) {
            renames.push({
              state: w.state, lga: w.lga, ward: w.ward,
              from: item.name, to: canon,
              confidence: Math.round(facilitySimilarity(item.name, canon) * 100) / 100,
              source: "grid3_ward", ids: item.ids, recordCount: item.ids.length,
            });
            recordsAffected += item.ids.length;
          } else {
            alreadyStandard++;
          }
          folded = true;
          break;
        }
      }
      if (folded) continue;

      const hit = clusters.find((c) =>
        c.variants.some((v) => facilitySimilarity(v.name, item.name) >= LOCAL_NAME_THRESHOLD),
      );
      if (hit) hit.variants.push(item);
      else clusters.push({ variants: [item] });
    }

    for (const c of clusters) {
      // Winner = most records, tie-break on the longest (most descriptive) name.
      const winner = [...c.variants].sort(
        (a, b) => b.ids.length - a.ids.length || b.name.length - a.name.length || a.name.localeCompare(b.name),
      )[0];
      if (c.variants.length < 2) alreadyStandard++;
      for (const v of c.variants) {
        if (v.name === winner.name) continue;
        renames.push({
          state: w.state, lga: w.lga, ward: w.ward,
          from: v.name, to: winner.name,
          confidence: Math.round(facilitySimilarity(v.name, winner.name) * 100) / 100,
          source: "local_consensus",
          ids: v.ids, recordCount: v.ids.length,
        });
        recordsAffected += v.ids.length;
      }

      // GRID3 has no record of this facility in the ward — surface it so a
      // supervisor can map it manually.
      const allIds = c.variants.flatMap((v) => v.ids);
      const near = bestFacility(winner.name, facWard.length ? facWard : facLga);
      notInGrid3.push({
        state: w.state, lga: w.lga, ward: w.ward,
        name: winner.name,
        ids: allIds,
        recordCount: allIds.length,
        nearest: near?.rec?.name ? titleCase(near.rec.name) : null,
        nearestScore: near ? Math.round(near.score * 100) / 100 : 0,
        grid3Options: wardOptions,
      });
    }

    onProgress?.(i + 1, list.length);
  }

  renames.sort(
    (a, b) =>
      a.lga.localeCompare(b.lga) ||
      a.ward.localeCompare(b.ward) ||
      a.from.localeCompare(b.from),
  );
  notInGrid3.sort(
    (a, b) => a.lga.localeCompare(b.lga) || a.ward.localeCompare(b.ward) || a.name.localeCompare(b.name),
  );

  return { renames, inspected, alreadyStandard, recordsAffected, unmatched: notInGrid3 };
}


/** Apply the renames in-memory (used for previews and exports). */
export function applyRenamesLocally<T extends HarmonizeRow>(rows: T[], renames: FacilityRename[]): T[] {
  const byId = new Map<string, string>();
  for (const r of renames) for (const id of r.ids) byId.set(id, r.to);
  return rows.map((r) => (r.id && byId.has(String(r.id)) ? { ...r, flhf_name: byId.get(String(r.id))! } : r));
}
