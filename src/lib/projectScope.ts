// Project geographic scope helpers.
//
// A project can be limited to specific States, LGAs and Wards. Values are stored
// as composite keys so names that repeat across the hierarchy stay unambiguous:
//   states : "Kano"
//   lgas   : "Kano|Dala"            ("State|LGA")
//   wards  : "Kano|Dala|Gwammaja"   ("State|LGA|Ward")
//
// An EMPTY array at any level means "no restriction at that level" (select all).

import { supabase } from "@/integrations/supabase/client";

export interface ProjectScope {
  states: string[];
  lgas: string[]; // "State|LGA"
  wards: string[]; // "State|LGA|Ward"
}

export const EMPTY_SCOPE: ProjectScope = { states: [], lgas: [], wards: [] };

export const lgaScopeKey = (state: string, lga: string) => `${state}|${lga}`;
export const wardScopeKey = (state: string, lga: string, ward: string) =>
  `${state}|${lga}|${ward}`;

/** True when the project has no geographic restriction at all. */
export const isUnrestricted = (s?: ProjectScope | null) =>
  !s || (s.states.length === 0 && s.lgas.length === 0 && s.wards.length === 0);

/** Restrict a list of state names to the scope (empty scope → all). */
export function filterStates(all: string[], scope?: ProjectScope | null): string[] {
  if (!scope || scope.states.length === 0) return all;
  const set = new Set(scope.states);
  return all.filter((s) => set.has(s));
}

/** Restrict LGA names (within a given state) to the scope. */
export function filterLgas(state: string, all: string[], scope?: ProjectScope | null): string[] {
  if (!scope || scope.lgas.length === 0) return all;
  const set = new Set(scope.lgas);
  return all.filter((l) => set.has(lgaScopeKey(state, l)));
}

/** Restrict ward names (within a state+LGA) to the scope. */
export function filterWards(state: string, lga: string, all: string[], scope?: ProjectScope | null): string[] {
  if (!scope || scope.wards.length === 0) return all;
  const set = new Set(scope.wards);
  return all.filter((w) => set.has(wardScopeKey(state, lga, w)));
}

/**
 * Whether a data row (with state/lga/ward) falls inside the project scope.
 * Each level is only enforced when that level has explicit selections, so a
 * state-only scope keeps all LGAs/wards in those states, and so on.
 */
export function rowInScope(
  scope: ProjectScope | null | undefined,
  row: { state?: string | null; lga?: string | null; ward?: string | null },
): boolean {
  if (isUnrestricted(scope)) return true;
  const s = (row.state ?? "").trim();
  const l = (row.lga ?? "").trim();
  const w = (row.ward ?? "").trim();

  if (scope!.states.length > 0 && !scope!.states.includes(s)) return false;
  if (scope!.lgas.length > 0) {
    // Only enforce LGA membership when this row's state actually has scoped LGAs.
    const stateHasScopedLgas = scope!.lgas.some((k) => k.startsWith(`${s}|`));
    if (stateHasScopedLgas && l && !scope!.lgas.includes(lgaScopeKey(s, l))) return false;
  }
  if (scope!.wards.length > 0) {
    const lgaHasScopedWards = scope!.wards.some((k) => k.startsWith(`${s}|${l}|`));
    if (lgaHasScopedWards && w && !scope!.wards.includes(wardScopeKey(s, l, w))) return false;
  }
  return true;
}

/** Normalize raw DB columns into a ProjectScope. */
export function scopeFromRow(row: any): ProjectScope {
  return {
    states: Array.isArray(row?.scope_states) ? row.scope_states : [],
    lgas: Array.isArray(row?.scope_lgas) ? row.scope_lgas : [],
    wards: Array.isArray(row?.scope_wards) ? row.scope_wards : [],
  };
}

/** Fetch a single project's scope from the database. */
export async function fetchProjectScope(projectId: string): Promise<ProjectScope> {
  if (!projectId) return { ...EMPTY_SCOPE };
  const { data } = await supabase
    .from("projects")
    .select("scope_states, scope_lgas, scope_wards")
    .eq("id", projectId)
    .maybeSingle();
  return scopeFromRow(data);
}
