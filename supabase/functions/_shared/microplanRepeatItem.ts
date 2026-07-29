// Pure parser helpers for a single community_repeat item coming from the
// Kobo webhook. Extracted so the same logic can be exercised from vitest
// (Node) without pulling in the Deno-only edge-function runtime.

export type AnyRec = Record<string, unknown>;

export function getFlat(obj: AnyRec, key: string): unknown {
  if (key in obj) return obj[key];
  const lowered = key.toLowerCase();
  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    if (kl === lowered || kl.endsWith(`/${lowered}`)) return v;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const found = getFlat(v as AnyRec, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function pickFirst(obj: AnyRec, keys: string[]): string | null {
  for (const k of keys) {
    const v = getFlat(obj, k);
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

export function pickNumber(obj: AnyRec, keys: string[]): number | null {
  const v = pickFirst(obj, keys);
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Extract the PWD / CDD / Trachoma sub-fields now nested inside
// community_repeat so the webhook can pass them through to microplan_entries.
export function extractRepeatDisaggregations(item: AnyRec): AnyRec {
  return {
    // Trachoma
    trachoma_0_5_months: pickNumber(item, ["trachoma_0_5_months", "trachoma_grp/trachoma_0_5_months"]),
    trachoma_6m_6y: pickNumber(item, ["trachoma_6m_6y", "trachoma_grp/trachoma_6m_6y"]),
    trachoma_7_14y: pickNumber(item, ["trachoma_7_14y", "trachoma_grp/trachoma_7_14y"]),
    trachoma_15_plus: pickNumber(item, ["trachoma_15_plus", "trachoma_grp/trachoma_15_plus"]),
    // PWD disaggregation
    pwd_total: pickNumber(item, ["pwd_total", "pwd_grp/pwd_total"]),
    pwd_visual: pickNumber(item, ["pwd_visual", "visual", "pwd_grp/pwd_visual"]),
    pwd_hearing: pickNumber(item, ["pwd_hearing", "hearing", "pwd_grp/pwd_hearing"]),
    pwd_physical: pickNumber(item, ["pwd_physical", "physical", "pwd_grp/pwd_physical"]),
    pwd_intellectual: pickNumber(item, ["pwd_intellectual", "intellectual", "pwd_grp/pwd_intellectual"]),
    pwd_communication: pickNumber(item, ["pwd_communication", "communication", "pwd_grp/pwd_communication"]),
    pwd_selfcare: pickNumber(item, ["pwd_selfcare", "self_care", "pwd_grp/pwd_selfcare"]),
    pwd_albinism: pickNumber(item, ["pwd_albinism", "albinism", "pwd_grp/pwd_albinism"]),
    // CDDs
    cdd_names: pickFirst(item, ["cdd_names", "cdd_grp/cdd_names"]),
    cdd_phone_numbers: pickFirst(item, ["cdd_phone_numbers", "cdd_phones", "cdd_grp/cdd_phone_numbers"]),
    cdd_from_community: pickFirst(item, ["cdd_from_community", "cdd_grp/cdd_from_community"]),
  };
}
