// Single source of truth for geography KPI counting.
//
// Wards (and LGAs / facilities) are counted on a *composite* key so that
// identically named wards in different LGAs are never collapsed, and blank /
// placeholder values ("", "  ", "Unassigned Ward") never inflate the count.
// The Planning dashboard, the Microplan Summary rollup and the Excel exports
// all call this so the numbers can never drift apart.

export interface GeoRowLike {
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  flhf_name?: string | null;
}

export interface GeoCounts {
  states: number;
  lgas: number;
  wards: number;
  flhfs: number;
}

const PLACEHOLDERS = new Set([
  "unassigned",
  "unassigned lga",
  "unassigned ward",
  "unassigned health facility",
  "unassigned state",
  "n/a",
  "na",
  "none",
  "-",
]);

/** Normalised geography token, or "" when the value carries no identity. */
export const geoKey = (v: unknown): string => {
  const s = String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return PLACEHOLDERS.has(s) ? "" : s;
};

export function countGeography(rows: GeoRowLike[]): GeoCounts {
  const states = new Set<string>();
  const lgas = new Set<string>();
  const wards = new Set<string>();
  const flhfs = new Set<string>();

  for (const r of rows) {
    const s = geoKey(r?.state);
    const l = geoKey(r?.lga);
    const w = geoKey(r?.ward);
    const f = geoKey(r?.flhf_name);
    if (s) states.add(s);
    if (l) lgas.add(`${s}||${l}`);
    if (w) wards.add(`${s}||${l}||${w}`);
    if (f) flhfs.add(`${s}||${l}||${w}||${f}`);
  }

  return { states: states.size, lgas: lgas.size, wards: wards.size, flhfs: flhfs.size };
}

export default countGeography;
