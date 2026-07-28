// Complete XLSForm exporter for the Geo-enabled Microplanning entry form.
//
// Produces an ODK / KoboToolbox / PyXForm-compatible .xlsx workbook with three
// sheets (`survey`, `choices`, `settings`) mirroring MicroplanEntryForm.tsx.
//
// Design goals (updated for KoboToolbox PyXForm-strict imports):
//   1. STRICT SANITIZATION — every `name` value in survey & choices is passed
//      through `sanitize()` (see below). No spaces, hyphens, slashes; never
//      starts with a digit; only [a-z0-9_].
//   2. UNIQUE CHOICE IDENTIFIERS — each choice `name` is scoped by its parent
//      chain (e.g. settlements: `<ward>__<settlement>__<idx>`) so that
//      (list_name, name) pairs are globally unique.
//   3. STATE-SCOPED CHOICES — GRID3 rows are limited to the active project's
//      locked states. Exporting the full national list caused PyXForm to
//      time out on Kobo import; state-scoped exports import in seconds.
//   4. SIMPLIFIED CHOICE FILTERS — one parent per level (`lga=${lga}`,
//      `ward=${ward}`, `flhf=${flhf}`, `community=${community}`) matching the
//      exact lower-case variable names PyXForm expects.
//   5. PER-PROJECT SETTINGS — form_title/form_id/version are stamped from the
//      caller project so each export is a distinct Kobo asset.

import * as XLSX from "xlsx";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import { getGrid3FullStateEntries } from "@/lib/grid3NigeriaData";

type Row = (string | number)[];

/**
 * Canonical PyXForm-safe sanitizer. Lower-cases the input, replaces any
 * character that isn't [a-z0-9_] with `_`, collapses runs of underscores,
 * strips leading/trailing underscores and prefixes `id_` when the resulting
 * value starts with a digit. Also trims to 60 chars (Kobo soft-limit).
 */
export const sanitize = (s: string): string => {
  const base = String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const bounded = base.slice(0, 60) || "x";
  return /^[0-9]/.test(bounded) ? `id_${bounded}`.slice(0, 60) : bounded;
};

const SURVEY_HEADER = [
  "type", "name", "label", "hint", "required", "required_message",
  "relevant", "constraint", "constraint_message", "calculation",
  "choice_filter", "appearance", "default", "image", "repeat_count",
];

// Choice parent columns follow the SIMPLIFIED cascade (single parent per level)
// so PyXForm's filter parser stays fast and unambiguous.
const CHOICES_HEADER = ["list_name", "name", "label", "lga", "ward", "flhf", "community", "lat", "lng"];

// NOTE: `default_language` intentionally excluded — form is single-language and
// including it forces PyXForm to require `label::English (en)` on every row.
const SETTINGS_HEADER = ["form_title", "form_id", "version", "style", "allow_choice_duplicates"];


/**
 * Sanitize `${...}` interpolations inside a hint/message so they strictly
 * reference valid XLSForm question names. PyXForm rejects rows where `${...}`
 * contains XPath expressions like `position(..)` or `.`; we strip those unsafe
 * interpolations (leaving surrounding literal text) so hints stay readable
 * while eliminating KoboToolbox's XPath syntax error.
 */
const VALID_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const sanitizeInterpolations = (s: string): string =>
  String(s ?? "").replace(/\$\{([^}]*)\}/g, (_m, inner) => {
    const trimmed = String(inner).trim();
    return VALID_NAME_RE.test(trimmed) ? `\${${trimmed}}` : "";
  });

const HINT_LIKE_COLS = new Set(["hint", "required_message", "constraint_message"]);
const q = (r: Partial<Record<(typeof SURVEY_HEADER)[number], string>>): Row =>
  SURVEY_HEADER.map((h) => {
    const v = (r as any)[h];
    if (v == null) return "";
    return HINT_LIKE_COLS.has(h) ? sanitizeInterpolations(String(v)) : v;
  });

const ch = (r: Partial<Record<(typeof CHOICES_HEADER)[number], string | number>>): Row =>
  CHOICES_HEADER.map((h) => {
    const v = (r as any)[h];
    return v == null ? "" : v;
  });

const geopointExpr = (lat: string, lng: string) =>
  `if(${lat}='' or ${lng}='', '', concat(${lat}, ' ', ${lng}, ' 0 0'))`;

export interface BuildProgress {
  phase: "states" | "flhfs" | "communities" | "assemble" | "done";
  done: number;
  total: number;
}

export interface BuildOptions {
  /** Optional: name of the active project — stamped into form_title/form_id. */
  projectName?: string | null;
  /** Optional: monotonically-increasing version integer (falls back to date stamp). */
  versionInt?: number | null;
  /**
   * Optional list of state names the project is locked to. When provided AND
   * non-empty, GRID3 choices are restricted to those states. When empty/null,
   * the FULL national list is exported (legacy behaviour — beware of Kobo
   * import timeouts on huge datasets).
   */
  projectStates?: string[] | null;
}

export async function buildMicroplanningXlsForm(
  onProgress?: (p: BuildProgress) => void,
  options: BuildOptions = {},
): Promise<XLSX.WorkBook> {
  const { projectName, versionInt, projectStates } = options;

  // ─── SURVEY ────────────────────────────────────────────────────────────
  const survey: Row[] = [SURVEY_HEADER as unknown as Row];

  survey.push(q({ type: "start", name: "start" }));
  survey.push(q({ type: "end", name: "end" }));
  survey.push(q({ type: "today", name: "today" }));
  survey.push(q({ type: "deviceid", name: "deviceid" }));
  survey.push(q({ type: "username", name: "username" }));
  survey.push(q({ type: "phonenumber", name: "phonenumber" }));

  // Cover / welcome — rendered as the FIRST SCREEN with the `home` media file
  // as a full-bleed image and NO other text/questions on the page. The note
  // label is intentionally a single non-breaking space so PyXForm accepts the
  // row while KoboCollect renders only the image.
  survey.push(q({
    type: "note", name: "welcome_cover_note",
    label: " ",
    image: "home",
    appearance: "no-label",
  }));

  survey.push(q({
    type: "note", name: "intro",
    label: '<font color="#0F172A"><b>Amehnities — Geo-enabled Microplanning Entry</b></font><br/>Complete each section. Cascaded LGA → Ward → FLHF → Community/Settlement is powered by GRID3. Where a name is missing, select <b>Other (specify manually)</b> to type it in.',
  }));

  // ── Section 1: Campaign & Year ──
  survey.push(q({ type: "begin_group", name: "campaign_year", label: '<font color="#0F172A"><b>📅 1. Campaign &amp; Year</b></font>', appearance: "field-list" }));
  survey.push(q({
    type: "integer", name: "year_of_microplanning", label: "Year of Microplanning",
    required: "yes", constraint: ". >= 2000 and . <= 2100",
    constraint_message: "Enter a year between 2000 and 2100.",
    default: String(new Date().getFullYear()),
  }));
  survey.push(q({
    type: "select_one campaign_type", name: "campaign_type", label: "Campaign Type",
    required: "yes", default: "ntd", appearance: "minimal",
  }));
  survey.push(q({
    type: "select_one population_source", name: "population_source",
    label: "Source of Population Data", appearance: "minimal",
  }));
  survey.push(q({ type: "end_group", name: "campaign_year_end" }));

  // ── Section 2: Administrative Hierarchy ──
  //
  // NOTE: When projectStates has exactly one entry we DROP the state select and
  // hard-code the state via a calculate — the export is scoped to that state
  // so a picker adds no value and shortens the form.
  const scopedStates =
    Array.isArray(projectStates) && projectStates.length > 0
      ? [...new Set(projectStates.map((s) => s.trim()).filter(Boolean))]
      : [];
  const singleState = scopedStates.length === 1 ? scopedStates[0] : null;

  survey.push(q({ type: "begin_group", name: "admin_hierarchy", label: '<font color="#0F172A"><b>📍 2. Administrative Hierarchy (GRID3 cascade)</b></font>', appearance: "field-list" }));
  if (singleState) {
    survey.push(q({
      type: "calculate", name: "state",
      calculation: `'${sanitize(singleState)}'`,
    }));
    survey.push(q({
      type: "note", name: "state_locked_note",
      label: `📍 Project state (locked): **${singleState}**`,
    }));
  } else {
    survey.push(q({
      type: "select_one states", name: "state", label: "State", required: "yes",
      appearance: "minimal search",
    }));
  }
  survey.push(q({
    type: "select_one lgas", name: "lga", label: "LGA / Local Government Area",
    required: "yes", appearance: "minimal search",
  }));
  survey.push(q({
    type: "select_one wards", name: "ward", label: "Ward", required: "yes",
    choice_filter: "lga=${lga}", appearance: "minimal search",
  }));
  survey.push(q({ type: "end_group", name: "admin_hierarchy_end" }));

  // ── Section 3: FLHF ──
  survey.push(q({ type: "begin_group", name: "flhf_grp", label: '<font color="#2563EB"><b>🏥 3. Frontline Health Facility (FLHF)</b></font>', appearance: "field-list" }));
  survey.push(q({
    type: "select_one flhfs", name: "flhf", label: "Name of FLHF (GRID3)",
    hint: "Type to search. Choose 'Other (specify manually)' if the FLHF is not listed.",
    required: "yes",
    choice_filter: "ward=${ward} or name='__other__'",
    appearance: "search autocomplete",
  }));
  survey.push(q({
    type: "text", name: "flhf_manual", label: "Other FLHF — type the exact name",
    required: "yes", relevant: "${flhf} = '__other__'",
  }));
  survey.push(q({
    type: "calculate", name: "flhf_name",
    calculation: "if(${flhf}='__other__', ${flhf_manual}, jr:choice-name(${flhf}, '${flhf}'))",
  }));
  survey.push(q({
    type: "calculate", name: "flhf_lat_grid3",
    calculation: "if(${flhf}='' or ${flhf}='__other__', '', instance('flhfs')/root/item[name=${flhf}]/lat)",
  }));
  survey.push(q({
    type: "calculate", name: "flhf_lng_grid3",
    calculation: "if(${flhf}='' or ${flhf}='__other__', '', instance('flhfs')/root/item[name=${flhf}]/lng)",
  }));
  survey.push(q({ type: "note", name: "flhf_grid3_note",
    label: "📍 GRID3 GPS: **${flhf_lat_grid3}, ${flhf_lng_grid3}** — capture below to override.",
    relevant: "${flhf_lat_grid3} != '' and ${flhf_lng_grid3} != ''",
  }));
  survey.push(q({
    type: "geopoint", name: "flhf_gps_override", label: "FLHF GPS (override — optional)",
    hint: "Leave blank to keep the GRID3 coordinates.",
    appearance: "placement-map",
  }));
  survey.push(q({
    type: "calculate", name: "flhf_latitude",
    calculation: "if(${flhf_gps_override}='', ${flhf_lat_grid3}, selected-at(${flhf_gps_override}, 0))",
  }));
  survey.push(q({
    type: "calculate", name: "flhf_longitude",
    calculation: "if(${flhf_gps_override}='', ${flhf_lng_grid3}, selected-at(${flhf_gps_override}, 1))",
  }));
  survey.push(q({ type: "text", name: "flhf_incharge_name", label: "FLHF In-charge Name" }));
  survey.push(q({
    type: "text", name: "flhf_incharge_phone", label: "FLHF In-charge Phone",
    constraint: "regex(., '^[0-9+\\\\- ]{7,20}$') or .=''",
    constraint_message: "Enter a valid phone number (digits, +, -, space; 7–20 chars).",
    appearance: "numbers",
  }));
  survey.push(q({ type: "end_group", name: "flhf_grp_end" }));

  // ── REPEAT: Community / Settlement (1-to-many under FLHF) ──
  // Each iteration captures one community + optional settlement + population +
  // context (terrain/access/security) so a single FLHF submission can carry
  // any number of communities.
  survey.push(q({
    type: "begin_repeat", name: "community_repeat",
    label: '<font color="#059669"><b>➕ Community / Settlement Entry</b></font>',
    hint: '<font color="#059669"><b>Community #${position(..)}</b></font>',
    appearance: "field-list",
  }));

  // ── Section 4: Community ──
  survey.push(q({ type: "begin_group", name: "community_grp", label: '<font color="#059669"><b>🏘️ 4. Community</b></font>', appearance: "field-list" }));
  survey.push(q({
    type: "select_one communities", name: "community", label: "Community (GRID3)",
    hint: "Type to search. Choose 'Other (specify manually)' if the community is not listed.",
    required: "yes",
    choice_filter: "ward=${ward} or name='__other__'",
    appearance: "search autocomplete",
  }));
  survey.push(q({
    type: "text", name: "community_manual", label: "Other Community — type the exact name",
    required: "yes", relevant: "${community} = '__other__'",
  }));
  survey.push(q({
    type: "calculate", name: "community_name",
    calculation: "if(${community}='__other__', ${community_manual}, jr:choice-name(${community}, '${community}'))",
  }));
  survey.push(q({
    type: "calculate", name: "community_lat_grid3",
    calculation: "if(${community}='' or ${community}='__other__', '', instance('communities')/root/item[name=${community}]/lat)",
  }));
  survey.push(q({
    type: "calculate", name: "community_lng_grid3",
    calculation: "if(${community}='' or ${community}='__other__', '', instance('communities')/root/item[name=${community}]/lng)",
  }));
  survey.push(q({ type: "note", name: "community_grid3_note",
    label: "📍 GRID3 GPS: **${community_lat_grid3}, ${community_lng_grid3}** — capture below to override.",
    relevant: "${community_lat_grid3} != '' and ${community_lng_grid3} != ''",
  }));
  survey.push(q({
    type: "geopoint", name: "community_gps_override", label: "Community GPS (override — optional)",
    hint: "Leave blank to keep GRID3 coordinates.", appearance: "placement-map",
  }));
  survey.push(q({
    type: "calculate", name: "community_latitude",
    calculation: "if(${community_gps_override}='', ${community_lat_grid3}, selected-at(${community_gps_override}, 0))",
  }));
  survey.push(q({
    type: "calculate", name: "community_longitude",
    calculation: "if(${community_gps_override}='', ${community_lng_grid3}, selected-at(${community_gps_override}, 1))",
  }));
  survey.push(q({ type: "text", name: "community_leader_name", label: "Community Leader" }));
  survey.push(q({
    type: "text", name: "community_leader_phone", label: "Leader Phone",
    constraint: "regex(., '^[0-9+\\\\- ]{7,20}$') or .=''",
    constraint_message: "Enter a valid phone number.", appearance: "numbers",
  }));
  survey.push(q({
    type: "calculate", name: "community_distance_to_flhf_km",
    calculation: "if(${flhf_latitude}='' or ${community_latitude}='', '', round(distance(" +
      geopointExpr("${flhf_latitude}", "${flhf_longitude}") + ", " +
      geopointExpr("${community_latitude}", "${community_longitude}") + ") div 1000, 2))",
  }));
  survey.push(q({
    type: "note", name: "community_distance_note",
    label: "🛣️ Distance Community → FLHF: **${community_distance_to_flhf_km} km** (auto-computed)",
    relevant: "${community_distance_to_flhf_km} != ''",
  }));
  survey.push(q({ type: "end_group", name: "community_grp_end" }));

  // ── Section 5: Settlement (optional) ──
  //
  // Settlements are keyed to the selected COMMUNITY when GRID3 links exist,
  // otherwise they fall back to ward-level filtering.
  survey.push(q({ type: "begin_group", name: "settlement_grp", label: '<font color="#059669"><b>🏘️ 5. Settlement (optional)</b></font>', appearance: "field-list" }));
  survey.push(q({
    type: "select_one settlements", name: "settlement", label: "Settlement (GRID3)",
    hint: "Optional. Choose 'Other (specify manually)' to type a name.",
    choice_filter: "(community=${community} or ward=${ward}) or name='__other__'",
    appearance: "search autocomplete",
  }));
  survey.push(q({
    type: "text", name: "settlement_manual", label: "Other Settlement — type the exact name",
    relevant: "${settlement} = '__other__'",
  }));
  survey.push(q({
    type: "calculate", name: "settlement_name",
    calculation: "if(${settlement}='', '', if(${settlement}='__other__', ${settlement_manual}, jr:choice-name(${settlement}, '${settlement}')))",
  }));
  survey.push(q({
    type: "calculate", name: "settlement_lat_grid3",
    calculation: "if(${settlement}='' or ${settlement}='__other__', '', instance('settlements')/root/item[name=${settlement}]/lat)",
  }));
  survey.push(q({
    type: "calculate", name: "settlement_lng_grid3",
    calculation: "if(${settlement}='' or ${settlement}='__other__', '', instance('settlements')/root/item[name=${settlement}]/lng)",
  }));
  survey.push(q({ type: "note", name: "settlement_grid3_note",
    label: "📍 GRID3 GPS: **${settlement_lat_grid3}, ${settlement_lng_grid3}** — capture below to override.",
    relevant: "${settlement_lat_grid3} != '' and ${settlement_lng_grid3} != ''",
  }));
  survey.push(q({
    type: "geopoint", name: "settlement_gps_override", label: "Settlement GPS (override — optional)",
    appearance: "placement-map",
  }));
  survey.push(q({
    type: "calculate", name: "settlement_latitude",
    calculation: "if(${settlement_gps_override}='', ${settlement_lat_grid3}, selected-at(${settlement_gps_override}, 0))",
  }));
  survey.push(q({
    type: "calculate", name: "settlement_longitude",
    calculation: "if(${settlement_gps_override}='', ${settlement_lng_grid3}, selected-at(${settlement_gps_override}, 1))",
  }));
  survey.push(q({ type: "text", name: "settlement_mai_unguwa", label: "Mai Unguwa (Settlement Head)" }));
  survey.push(q({
    type: "calculate", name: "settlement_distance_to_flhf_km",
    calculation: "if(${flhf_latitude}='' or ${settlement_latitude}='', '', round(distance(" +
      geopointExpr("${flhf_latitude}", "${flhf_longitude}") + ", " +
      geopointExpr("${settlement_latitude}", "${settlement_longitude}") + ") div 1000, 2))",
  }));
  survey.push(q({ type: "end_group", name: "settlement_grp_end" }));

  // ── Section 6: Terrain, Access, Security ──
  survey.push(q({ type: "begin_group", name: "context_grp", label: '<font color="#D97706"><b>🔒 6. Terrain, Access &amp; Security</b></font>', appearance: "field-list" }));
  survey.push(q({ type: "select_one terrain_type", name: "terrain_type", label: "Type of Terrain", appearance: "quick" }));
  survey.push(q({ type: "select_one accessibility", name: "accessibility", label: "Accessibility", appearance: "quick" }));
  survey.push(q({ type: "select_one security_clearance", name: "security_clearance", label: "Security Clearance", appearance: "quick" }));
  survey.push(q({ type: "end_group", name: "context_grp_end" }));

  // ── Section 7: Population Estimates ──
  survey.push(q({ type: "begin_group", name: "pop_grp", label: '<font color="#4F46E5"><b>👥 7. Population Estimates</b></font>', appearance: "field-list" }));
  survey.push(q({ type: "integer", name: "estimated_children_0_4", label: "Children 0–4 years", constraint: ". >= 0", constraint_message: "Must be zero or greater." }));
  survey.push(q({ type: "integer", name: "estimated_children_5_14", label: "Children 5–14 years", constraint: ". >= 0", constraint_message: "Must be zero or greater." }));
  survey.push(q({ type: "integer", name: "estimated_adults_15_plus", label: "Adults 15+ years", constraint: ". >= 0", constraint_message: "Must be zero or greater." }));
  survey.push(q({
    type: "calculate", name: "estimated_total_population",
    calculation: "coalesce(${estimated_children_0_4},0) + coalesce(${estimated_children_5_14},0) + coalesce(${estimated_adults_15_plus},0)",
  }));
  survey.push(q({
    type: "calculate", name: "total_population",
    calculation: "${estimated_total_population}",
  }));
  survey.push(q({ type: "note", name: "pop_total_note", label: '<b>Estimated Total Population: ${estimated_total_population}</b> (auto-computed)' }));
  survey.push(q({
    type: "integer", name: "target_population", label: "Target Population (eligible for campaign)",
    constraint: ". >= 0 and . <= ${estimated_total_population}",
    constraint_message: '<font color="#DC2626">Target population cannot exceed total population!</font>',
  }));
  survey.push(q({ type: "integer", name: "number_of_households", label: "Number of Households", constraint: ". >= 0", constraint_message: "Must be zero or greater." }));
  survey.push(q({ type: "end_group", name: "pop_grp_end" }));

  // ── END REPEAT: community_repeat ──
  survey.push(q({ type: "end_repeat", name: "community_repeat_end" }));

  // ── Section 8: Trachoma Age Disaggregation ──
  survey.push(q({ type: "begin_group", name: "trachoma_grp", label: "8. Trachoma Age Disaggregation (optional)", appearance: "field-list" }));
  survey.push(q({ type: "select_one yes_no", name: "include_trachoma", label: "Include trachoma-specific age disaggregation?", appearance: "minimal", default: "no" }));
  const tracRel = "${include_trachoma} = 'yes'";
  survey.push(q({ type: "integer", name: "trachoma_0_5_months", label: "0–5 months", relevant: tracRel, constraint: ". >= 0" }));
  survey.push(q({ type: "integer", name: "trachoma_6m_6y", label: "6 months – 6 years", relevant: tracRel, constraint: ". >= 0" }));
  survey.push(q({ type: "integer", name: "trachoma_7_14y", label: "7–14 years", relevant: tracRel, constraint: ". >= 0" }));
  survey.push(q({ type: "integer", name: "trachoma_15_plus", label: "15+ years", relevant: tracRel, constraint: ". >= 0" }));
  survey.push(q({ type: "end_group", name: "trachoma_grp_end" }));

  // ── Section 9: PWD ──
  survey.push(q({ type: "begin_group", name: "pwd_grp", label: "9. Persons With Disability (Disaggregation)", appearance: "field-list" }));
  const pwdFields: [string, string][] = [
    ["pwd_total", "PWD — Total"], ["pwd_visual", "Visual"], ["pwd_hearing", "Hearing"],
    ["pwd_physical", "Physical"], ["pwd_intellectual", "Intellectual"], ["pwd_communication", "Communication"],
    ["pwd_selfcare", "Self-care"], ["pwd_albinism", "Albinism"],
  ];
  for (const [n, l] of pwdFields) {
    survey.push(q({ type: "integer", name: n, label: l, constraint: ". >= 0", constraint_message: "Must be zero or greater." }));
  }
  survey.push(q({ type: "end_group", name: "pwd_grp_end" }));

  // ── Section 10: CDDs ──
  survey.push(q({ type: "begin_group", name: "cdd_grp", label: "10. Community Directed Distributors (CDDs)", appearance: "field-list" }));
  survey.push(q({ type: "text", name: "cdd_names", label: "CDD Names (comma-separated)", appearance: "multiline" }));
  survey.push(q({ type: "text", name: "cdd_phone_numbers", label: "CDD Phone Numbers (comma-separated)", appearance: "multiline" }));
  survey.push(q({ type: "select_one yes_no", name: "cdd_from_community", label: "Is the CDD from this Community/Settlement?", appearance: "minimal" }));
  survey.push(q({ type: "end_group", name: "cdd_grp_end" }));

  // ── Section 11: Notes ──
  survey.push(q({ type: "text", name: "notes", label: "Additional Notes", appearance: "multiline" }));

  // ─── CHOICES ───────────────────────────────────────────────────────────
  const choices: Row[] = [CHOICES_HEADER as unknown as Row];

  // Global (list_name, name) dedup gate — every push goes through this to
  // guarantee PyXForm never sees "name appears more than once in list …".
  const choiceKeys = new Set<string>();
  const pushChoice = (row: Partial<Record<(typeof CHOICES_HEADER)[number], string | number>>) => {
    const list = String(row.list_name ?? "");
    const name = String(row.name ?? "");
    if (!list || !name) return;
    const key = `${list}\u0001${name}`;
    if (choiceKeys.has(key)) return;
    choiceKeys.add(key);
    choices.push(ch(row));
  };

  pushChoice({ list_name: "yes_no", name: "yes", label: "Yes" });
  pushChoice({ list_name: "yes_no", name: "no", label: "No" });

  for (const [n, l] of [
    ["ntd", "NTD (MDA)"], ["polio", "Polio (SIA)"], ["malaria", "Malaria (ITN/IRS)"],
    ["routine_immunization", "Routine Immunization"], ["covid19", "COVID-19 Vaccination"],
    ["nutrition", "Nutrition"], ["other", "Other"],
  ]) pushChoice({ list_name: "campaign_type", name: n, label: l });

  for (const [n, l] of [
    ["census", "National Census"], ["projected", "Census Projection"],
    ["community_leader", "Community Leader Estimate"], ["health_facility", "Health Facility Records"],
    ["household_listing", "Household Listing"], ["survey", "Survey/Study"], ["other", "Other"],
  ]) pushChoice({ list_name: "population_source", name: n, label: l });

  for (const [n, l] of [
    ["flat", "Flat"], ["hilly", "Hilly"], ["mountainous", "Mountainous"],
    ["riverine", "Riverine"], ["swampy", "Swampy"], ["desert", "Desert"], ["forest", "Forest"],
  ]) pushChoice({ list_name: "terrain_type", name: n, label: l });
  for (const [n, l] of [
    ["accessible", "Accessible"], ["hard_to_reach", "Hard to Reach"],
    ["inaccessible", "Inaccessible"], ["seasonal", "Seasonal Access"],
  ]) pushChoice({ list_name: "accessibility", name: n, label: l });
  for (const [n, l] of [
    ["cleared", "Cleared"], ["partial", "Partial"], ["not_cleared", "Not Cleared"], ["unknown", "Unknown"],
  ]) pushChoice({ list_name: "security_clearance", name: n, label: l });

  // ── GRID3 cascade — SCOPED to project states ──
  const allStates = getAllStates();
  const targetStates = scopedStates.length > 0
    ? allStates.filter((s) => scopedStates.includes(s))
    : allStates;

  // Composite-key → sanitized id maps guarantee we only ever assign ONE id per
  // real-world (state, lga, ward, flhf, community) tuple, even when GRID3
  // returns the same admin unit across many rows.
  const stateNameById = new Map<string, string>();      // state → sid
  const lgaNameById = new Map<string, string>();        // `${state}||${lga}` → lid
  const wardNameById = new Map<string, string>();       // `${state}||${lga}||${ward}` → wid
  const flhfIdByKey = new Map<string, string>();        // `${wid}||${slug}` → id
  const communityIdByKey = new Map<string, string>();   // `${wid}||${slug}` → id
  const settlementIdByKey = new Map<string, string>();  // `${cid}||${slug}` → id

  onProgress?.({ phase: "states", done: 0, total: targetStates.length });
  targetStates.forEach((s) => {
    const id = sanitize(s);
    stateNameById.set(s, id);
    if (!singleState) pushChoice({ list_name: "states", name: id, label: s });
  });

  targetStates.forEach((s, i) => {
    const sid = stateNameById.get(s)!;
    for (const lga of getLGAsForState(s)) {
      const lgaKey = `${s}||${lga}`;
      let lid = lgaNameById.get(lgaKey);
      if (!lid) {
        lid = `${sid}__${sanitize(lga)}`.slice(0, 60);
        lgaNameById.set(lgaKey, lid);
      }
      pushChoice({ list_name: "lgas", name: lid, label: lga });
      for (const ward of getWardsForLGA(s, lga)) {
        const wardKey = `${s}||${lga}||${ward}`;
        let wid = wardNameById.get(wardKey);
        if (!wid) {
          wid = sanitize(`${lid}__${sanitize(ward)}`);
          wardNameById.set(wardKey, wid);
        }
        pushChoice({ list_name: "wards", name: wid, label: ward, lga: lid });
      }
    }
    onProgress?.({ phase: "states", done: i + 1, total: targetStates.length });
  });

  const resolveWardId = (state: string, lga: string, ward: string): { lid: string; wid: string } => {
    const sid = stateNameById.get(state) ?? sanitize(state);
    const lgaKey = `${state}||${lga}`;
    let lid = lgaNameById.get(lgaKey);
    if (!lid) {
      lid = `${sid}__${sanitize(lga)}`.slice(0, 60);
      lgaNameById.set(lgaKey, lid);
      pushChoice({ list_name: "lgas", name: lid, label: lga });
    }
    const wardKey = `${state}||${lga}||${ward}`;
    let wid = wardNameById.get(wardKey);
    if (!wid) {
      wid = sanitize(`${lid}__${sanitize(ward)}`);
      wardNameById.set(wardKey, wid);
      pushChoice({ list_name: "wards", name: wid, label: ward, lga: lid });
    }
    return { lid, wid };
  };

  // FLHFs — dedup by (ward, sanitized-name)
  pushChoice({ list_name: "flhfs", name: "__other__", label: "Other (specify manually)" });
  for (let i = 0; i < targetStates.length; i++) {
    const s = targetStates[i];
    onProgress?.({ phase: "flhfs", done: i, total: targetStates.length });
    let entries: Awaited<ReturnType<typeof getGrid3FullStateEntries>> = [];
    try { entries = await getGrid3FullStateEntries("fac", s); } catch { entries = []; }
    for (const e of entries) {
      const { wid } = resolveWardId(s, e.lga, e.ward);
      const slug = sanitize(e.name);
      const key = `${wid}||${slug}`;
      if (flhfIdByKey.has(key)) continue;
      const id = sanitize(`${wid}__f_${slug}`);
      flhfIdByKey.set(key, id);
      pushChoice({
        list_name: "flhfs", name: id, label: e.name,
        ward: wid,
        lat: e.latitude ?? "", lng: e.longitude ?? "",
      });
    }
  }
  onProgress?.({ phase: "flhfs", done: targetStates.length, total: targetStates.length });

  // Communities & Settlements — dedup community by (ward, slug) so multiple
  // settlement rows sharing the same parent community reuse the SAME id.
  pushChoice({ list_name: "communities", name: "__other__", label: "Other (specify manually)" });
  pushChoice({ list_name: "settlements", name: "__other__", label: "Other (specify manually)" });
  for (let i = 0; i < targetStates.length; i++) {
    const s = targetStates[i];
    onProgress?.({ phase: "communities", done: i, total: targetStates.length });
    let entries: Awaited<ReturnType<typeof getGrid3FullStateEntries>> = [];
    try { entries = await getGrid3FullStateEntries("set", s); } catch { entries = []; }
    for (const e of entries) {
      const { wid } = resolveWardId(s, e.lga, e.ward);
      const slug = sanitize(e.name);
      const cKey = `${wid}||${slug}`;
      let cId = communityIdByKey.get(cKey);
      if (!cId) {
        cId = sanitize(`${wid}__c_${slug}`);
        communityIdByKey.set(cKey, cId);
        pushChoice({
          list_name: "communities", name: cId, label: e.name,
          ward: wid,
          lat: e.latitude ?? "", lng: e.longitude ?? "",
        });
      }
      const sKey = `${cId}||${slug}`;
      if (settlementIdByKey.has(sKey)) continue;
      const xId = sanitize(`${cId}__s_${slug}`);
      settlementIdByKey.set(sKey, xId);
      pushChoice({
        list_name: "settlements", name: xId, label: e.name,
        ward: wid, community: cId,
        lat: e.latitude ?? "", lng: e.longitude ?? "",
      });
    }
  }
  onProgress?.({ phase: "communities", done: targetStates.length, total: targetStates.length });

  // ─── SETTINGS ──────────────────────────────────────────────────────────
  onProgress?.({ phase: "assemble", done: 0, total: 1 });
  // YYYYMMDDHHmm (12 chars) — matches request spec.
  const versionStamp = versionInt != null
    ? String(versionInt)
    : new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12);
  const formTitle = projectName
    ? `${projectName} — Geo Microplanning`
    : "Geo Microplanning";
  // Canonical stable form_id so Kobo overwrites the same asset on re-upload.
  const formId = "amehnities_geo_microplanning";
  const settings: Row[] = [
    SETTINGS_HEADER as unknown as Row,
    [formTitle, formId, versionStamp, "theme-grid", "yes"],
  ];


  const wb = XLSX.utils.book_new();
  const surveySheet = XLSX.utils.aoa_to_sheet(survey);
  const choicesSheet = XLSX.utils.aoa_to_sheet(choices);
  const settingsSheet = XLSX.utils.aoa_to_sheet(settings);
  (surveySheet as any)["!cols"] = SURVEY_HEADER.map((h) =>
    ({ wch: h === "label" || h === "calculation" || h === "constraint" ? 40 : 18 }));
  (choicesSheet as any)["!cols"] = CHOICES_HEADER.map((h) =>
    ({ wch: h === "label" ? 36 : h === "name" ? 30 : 14 }));
  XLSX.utils.book_append_sheet(wb, surveySheet, "survey");
  XLSX.utils.book_append_sheet(wb, choicesSheet, "choices");
  XLSX.utils.book_append_sheet(wb, settingsSheet, "settings");
  onProgress?.({ phase: "done", done: 1, total: 1 });
  return wb;
}

export async function downloadMicroplanningXlsForm(
  onProgress?: (p: BuildProgress) => void,
  options: BuildOptions = {},
) {
  const wb = await buildMicroplanningXlsForm(onProgress, options);
  const slug = sanitize(options.projectName || "amehnities");
  XLSX.writeFile(wb, `${slug}_microplan_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function workbookToBase64(wb: XLSX.WorkBook): { bytes: Uint8Array; base64: string; size: number } {
  const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return { bytes, base64: btoa(bin), size: bytes.length };
}

export function downloadWorkbookBlob(wb: XLSX.WorkBook, filename: string) {
  const { bytes } = workbookToBase64(wb);
  const buf = bytes.slice().buffer as ArrayBuffer;
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
