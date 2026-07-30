// Geo-enabled Microplanning XLSForm exporter.
//
// STRUCTURE SOURCE OF TRUTH: the master workbook supplied by the programme
// team (`aH2UfUo8VDqDmqNUUeJ4bJ (1).xlsx`). Its survey order, groups, choice
// lists and settings are reproduced here, with three deliberate hardening
// changes required by Amehnities:
//
//   1. NO RAW HTML — the master used <span style="color: blue;">…</span> in
//      group labels. KoboCollect escapes those, so every label is emitted as
//      clean Markdown (`### 📍 Community Details`).
//   2. FREE-TEXT FLHF / COMMUNITY / SETTLEMENT — these are typed by the
//      enumerator (`type: text`), never picked from a pre-populated GRID3
//      choice list, and no GPS is pre-filled for them.
//   3. DUAL GPS — every location captures a native `geopoint` PLUS manual
//      decimal latitude/longitude inputs. A `calculate` resolves the final
//      coordinate with geopoint-first precedence; the webhook applies the same
//      fallback hierarchy server-side.
//
// The State → LGA → Ward cascade stays dynamic and is generated from the
// GRID3/INEC registry (37 states / 774 LGAs / 9,410 wards).

import * as XLSX from "xlsx";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";

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

// Cascade parent columns: LGA rows carry `state`, Ward rows carry `lga`.
const CHOICES_HEADER = ["list_name", "name", "label", "state", "lga"];

const SETTINGS_HEADER = ["form_title", "form_id", "version", "style", "allow_choice_duplicates"];

/**
 * Strip raw HTML markup from any label/hint. The master workbook shipped
 * <span style="…"> wrappers; KoboCollect renders those as literal text.
 */
export const stripHtml = (s: string): string =>
  String(s ?? "")
    .replace(/<\s*\/?\s*[a-zA-Z][^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

/**
 * Sanitize `${...}` interpolations inside a hint/message so they strictly
 * reference valid XLSForm question names.
 */
const VALID_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const sanitizeInterpolations = (s: string): string =>
  String(s ?? "").replace(/\$\{([^}]*)\}/g, (_m, inner) => {
    const trimmed = String(inner).trim();
    return VALID_NAME_RE.test(trimmed) ? `\${${trimmed}}` : "";
  });

const HINT_LIKE_COLS = new Set(["hint", "required_message", "constraint_message"]);
const TEXTY_COLS = new Set(["label", "hint", "required_message", "constraint_message"]);
const q = (r: Partial<Record<(typeof SURVEY_HEADER)[number], string>>): Row =>
  SURVEY_HEADER.map((h) => {
    const v = (r as any)[h];
    if (v == null) return "";
    let out = String(v);
    if (TEXTY_COLS.has(h)) out = stripHtml(out);
    if (HINT_LIKE_COLS.has(h)) out = sanitizeInterpolations(out);
    return out;
  });

const ch = (r: Partial<Record<(typeof CHOICES_HEADER)[number], string | number>>): Row =>
  CHOICES_HEADER.map((h) => {
    const v = (r as any)[h];
    return v == null ? "" : (typeof v === "string" ? stripHtml(v) : v);
  });

const geopointExpr = (lat: string, lng: string) =>
  `if(${lat}='' or ${lng}='', '', concat(${lat}, ' ', ${lng}, ' 0 0'))`;

/**
 * Dual-GPS resolver expression: prefer the native geopoint reading, fall back
 * to the manually typed decimal when the geopoint was not captured.
 */
const dualGps = (geopoint: string, manual: string, index: 0 | 1) =>
  `if(${geopoint} = '', ${manual}, selected-at(${geopoint}, ${index}))`;

export interface BuildProgress {
  phase: "states" | "flhfs" | "communities" | "assemble" | "done";
  done: number;
  total: number;
}

export interface BuildOptions {
  /** Optional: name of the active project — stamped into form_title. */
  projectName?: string | null;
  /** Optional: monotonically-increasing version integer (falls back to date stamp). */
  versionInt?: number | null;
  /**
   * Optional list of state names the project is locked to. When provided AND
   * non-empty, the cascade is restricted to those states; otherwise the full
   * 37-state / 774-LGA / 9,410-ward registry is exported.
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

  // ── Cover: full-bleed `home` image, nothing else on the screen ──
  survey.push(q({ type: "begin_group", name: "grp_welcome", label: " ", appearance: "field-list" }));
  survey.push(q({
    type: "note", name: "welcome_cover_note",
    label: " ", image: "home", appearance: "w100 no-label",
  }));
  survey.push(q({ type: "end_group", name: "grp_welcome_end" }));

  // ── Section 1: Campaign & Year ──
  survey.push(q({ type: "begin_group", name: "grp_campaign_year", label: "### 📅 Campaign & Year", appearance: "field-list" }));
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
    label: "Source of Population Data", required: "yes",
    default: "health_facility", appearance: "minimal",
  }));
  survey.push(q({ type: "end_group", name: "grp_campaign_year_end" }));

  // ── Section 2: Administrative Hierarchy (dynamic GRID3 cascade) ──
  const scopedStates =
    Array.isArray(projectStates) && projectStates.length > 0
      ? [...new Set(projectStates.map((s) => s.trim()).filter(Boolean))]
      : [];

  survey.push(q({ type: "begin_group", name: "grp_admin_hierarchy", label: "### 🏛️ Administrative Hierarchy", appearance: "field-list" }));
  survey.push(q({
    type: "select_one states", name: "state", label: "State", required: "yes",
    appearance: "minimal autocomplete",
  }));
  survey.push(q({
    type: "select_one lgas", name: "lga", label: "LGA", required: "yes",
    choice_filter: "state=${state}", appearance: "minimal autocomplete",
  }));
  survey.push(q({
    type: "select_one wards", name: "ward", label: "Ward", required: "yes",
    choice_filter: "lga=${lga}", appearance: "minimal autocomplete",
  }));
  survey.push(q({ type: "end_group", name: "grp_admin_hierarchy_end" }));

  // ── Section 3: FLHF (free text + dual GPS) ──
  survey.push(q({ type: "begin_group", name: "grp_flhf", label: "### 🏥 Frontline Health Facility (FLHF)", appearance: "field-list" }));
  survey.push(q({ type: "text", name: "flhf_name", label: "Name of FLHF", required: "yes" }));
  survey.push(q({ type: "text", name: "flhf_incharge_name", label: "FLHF In-charge Name", required: "yes" }));
  survey.push(q({
    type: "text", name: "flhf_incharge_phone", label: "FLHF In-charge Phone Number",
    constraint: "regex(., '^(\\+234|234|0)[789][01][0-9]{8}$') or .=''",
    constraint_message: "Enter a valid 11-digit Nigerian phone number.",
    appearance: "numbers",
  }));
  survey.push(q({ type: "geopoint", name: "flhf_gps", label: "Capture FLHF GPS Location" }));
  survey.push(q({
    type: "decimal", name: "flhf_manual_latitude", label: "FLHF Latitude (type manually if GPS unavailable)",
    constraint: ". >= -90 and . <= 90", constraint_message: "Latitude must be between -90 and 90.",
  }));
  survey.push(q({
    type: "decimal", name: "flhf_manual_longitude", label: "FLHF Longitude (type manually if GPS unavailable)",
    constraint: ". >= -180 and . <= 180", constraint_message: "Longitude must be between -180 and 180.",
  }));
  survey.push(q({ type: "calculate", name: "flhf_latitude", calculation: dualGps("${flhf_gps}", "${flhf_manual_latitude}", 0) }));
  survey.push(q({ type: "calculate", name: "flhf_longitude", calculation: dualGps("${flhf_gps}", "${flhf_manual_longitude}", 1) }));
  survey.push(q({ type: "end_group", name: "grp_flhf_end" }));

  // ── REPEAT: one iteration per community under this FLHF ──
  survey.push(q({
    type: "begin_repeat", name: "community_repeat",
    label: "Additional Community",
    hint: "Add one entry per community under this FLHF.",
  }));

  // Section 4: Community details
  survey.push(q({ type: "begin_group", name: "grp_comm_location", label: "### 📍 Community Details", appearance: "field-list" }));
  survey.push(q({ type: "text", name: "community_name", label: "Community Name", required: "yes" }));
  survey.push(q({ type: "text", name: "community_leader_name", label: "Community Leader's Name" }));
  survey.push(q({
    type: "text", name: "community_leader_phone", label: "Community Leader's Phone Number",
    constraint: "regex(., '^(\\+234|234|0)[789][01][0-9]{8}$') or .=''",
    constraint_message: "Enter a valid 11-digit Nigerian phone number.",
    appearance: "numbers",
  }));
  survey.push(q({ type: "geopoint", name: "community_gps", label: "Capture Community GPS Location" }));
  survey.push(q({
    type: "decimal", name: "community_manual_latitude", label: "Community Latitude (type manually if GPS unavailable)",
    constraint: ". >= -90 and . <= 90", constraint_message: "Latitude must be between -90 and 90.",
  }));
  survey.push(q({
    type: "decimal", name: "community_manual_longitude", label: "Community Longitude (type manually if GPS unavailable)",
    constraint: ". >= -180 and . <= 180", constraint_message: "Longitude must be between -180 and 180.",
  }));
  survey.push(q({ type: "calculate", name: "community_latitude", calculation: dualGps("${community_gps}", "${community_manual_latitude}", 0) }));
  survey.push(q({ type: "calculate", name: "community_longitude", calculation: dualGps("${community_gps}", "${community_manual_longitude}", 1) }));
  survey.push(q({
    type: "calculate", name: "community_distance_to_flhf_km",
    calculation: "if(${flhf_latitude}='' or ${community_latitude}='', '', round(distance(" +
      geopointExpr("${flhf_latitude}", "${flhf_longitude}") + ", " +
      geopointExpr("${community_latitude}", "${community_longitude}") + ") div 1000, 2))",
  }));
  survey.push(q({
    type: "note", name: "community_distance_note",
    label: "Distance from FLHF to Community: **${community_distance_to_flhf_km} km**",
    relevant: "${community_distance_to_flhf_km} != ''",
  }));
  survey.push(q({ type: "end_group", name: "grp_comm_location_end" }));

  // Section 5: Settlement
  survey.push(q({ type: "begin_group", name: "grp_comm_settlement", label: "### 🛖 Settlement Information", appearance: "field-list" }));
  survey.push(q({ type: "text", name: "settlement_name", label: "Settlement Name" }));
  survey.push(q({ type: "text", name: "settlement_mai_unguwa", label: "Mai Unguwa (Settlement Head)" }));
  survey.push(q({ type: "geopoint", name: "settlement_gps", label: "Capture Settlement GPS Location" }));
  survey.push(q({
    type: "decimal", name: "settlement_manual_latitude", label: "Settlement Latitude (type manually if GPS unavailable)",
    constraint: ". >= -90 and . <= 90", constraint_message: "Latitude must be between -90 and 90.",
  }));
  survey.push(q({
    type: "decimal", name: "settlement_manual_longitude", label: "Settlement Longitude (type manually if GPS unavailable)",
    constraint: ". >= -180 and . <= 180", constraint_message: "Longitude must be between -180 and 180.",
  }));
  survey.push(q({ type: "calculate", name: "settlement_latitude", calculation: dualGps("${settlement_gps}", "${settlement_manual_latitude}", 0) }));
  survey.push(q({ type: "calculate", name: "settlement_longitude", calculation: dualGps("${settlement_gps}", "${settlement_manual_longitude}", 1) }));
  survey.push(q({
    type: "calculate", name: "settlement_distance_to_flhf_km",
    calculation: "if(${flhf_latitude}='' or ${settlement_latitude}='', '', round(distance(" +
      geopointExpr("${flhf_latitude}", "${flhf_longitude}") + ", " +
      geopointExpr("${settlement_latitude}", "${settlement_longitude}") + ") div 1000, 2))",
  }));
  survey.push(q({ type: "end_group", name: "grp_comm_settlement_end" }));

  // Section 6: Terrain, access, security
  survey.push(q({ type: "begin_group", name: "grp_comm_context", label: "### 🗺️ Terrain, Access & Security", appearance: "field-list" }));
  survey.push(q({ type: "select_one terrain_type", name: "terrain_type", label: "Type of Terrain", required: "yes", appearance: "minimal" }));
  survey.push(q({ type: "select_one accessibility", name: "accessibility", label: "Accessibility", required: "yes", appearance: "minimal" }));
  survey.push(q({ type: "select_one security_clearance", name: "security_clearance", label: "Security Clearance", required: "yes", appearance: "minimal" }));
  survey.push(q({ type: "end_group", name: "grp_comm_context_end" }));

  // Section 7: Population & demographics
  survey.push(q({ type: "begin_group", name: "grp_comm_demographics", label: "### 👥 Estimated Population", appearance: "field-list" }));
  survey.push(q({ type: "integer", name: "estimated_children_0_4", label: "Children 0–4 yrs", required: "yes", constraint: ". >= 0", constraint_message: "Must be zero or greater." }));
  survey.push(q({ type: "integer", name: "estimated_children_5_14", label: "Children 5–14 yrs", required: "yes", constraint: ". >= 0", constraint_message: "Must be zero or greater." }));
  survey.push(q({ type: "integer", name: "estimated_adults_15_plus", label: "Adults 15+ yrs", required: "yes", constraint: ". >= 0", constraint_message: "Must be zero or greater." }));
  survey.push(q({
    type: "calculate", name: "estimated_total_population",
    calculation: "coalesce(${estimated_children_0_4},0) + coalesce(${estimated_children_5_14},0) + coalesce(${estimated_adults_15_plus},0)",
  }));
  survey.push(q({ type: "note", name: "pop_total_note", label: "**Total Population = ${estimated_total_population}**" }));
  survey.push(q({ type: "integer", name: "number_of_households", label: "Number of Households", required: "yes", constraint: ". >= 0", constraint_message: "Must be zero or greater." }));
  survey.push(q({ type: "end_group", name: "grp_comm_demographics_end" }));

  // Section 8: Trachoma age disaggregation (optional)
  survey.push(q({ type: "begin_group", name: "grp_comm_trachoma", label: "### 👁️ Trachoma Age Disaggregation (optional)", appearance: "field-list" }));
  survey.push(q({ type: "select_one yes_no", name: "include_trachoma", label: "Include trachoma-specific age disaggregation?", appearance: "minimal", default: "no" }));
  const tracRel = "${include_trachoma} = 'yes'";
  survey.push(q({ type: "integer", name: "trachoma_0_5_months", label: "0–5 Months", relevant: tracRel, constraint: ". >= 0", default: "0" }));
  survey.push(q({ type: "integer", name: "trachoma_6m_6y", label: "6 Months – 6 Years", relevant: tracRel, constraint: ". >= 0", default: "0" }));
  survey.push(q({ type: "integer", name: "trachoma_7_14y", label: "7 – 14 Years", relevant: tracRel, constraint: ". >= 0", default: "0" }));
  survey.push(q({ type: "integer", name: "trachoma_15_plus", label: "15+ Years", relevant: tracRel, constraint: ". >= 0", default: "0" }));
  survey.push(q({ type: "end_group", name: "grp_comm_trachoma_end" }));

  // Section 9: Disability disaggregation
  survey.push(q({ type: "begin_group", name: "grp_comm_pwd", label: "### ♿ Disability Disaggregation", appearance: "field-list" }));
  const pwdFields: [string, string][] = [
    ["pwd_total", "PWD — Total"], ["pwd_visual", "Visual/Seeing"], ["pwd_hearing", "Hearing"],
    ["pwd_physical", "Physical/Mobility"], ["pwd_intellectual", "Intellectual/Cognitive"],
    ["pwd_communication", "Communication/Speech"], ["pwd_selfcare", "Self-care"], ["pwd_albinism", "Albinism"],
  ];
  for (const [n, l] of pwdFields) {
    survey.push(q({ type: "integer", name: n, label: l, constraint: ". >= 0", constraint_message: "Must be zero or greater.", default: "0" }));
  }
  survey.push(q({ type: "end_group", name: "grp_comm_pwd_end" }));

  // Section 10: CDDs
  survey.push(q({ type: "begin_group", name: "grp_comm_cdd", label: "### 🤝 CDDs Information", appearance: "field-list" }));
  survey.push(q({ type: "text", name: "cdd_names", label: "Name(s) of CDD", appearance: "multiline" }));
  survey.push(q({
    type: "text", name: "cdd_phone_numbers", label: "Phone Number(s) of CDD(s)",
    constraint: "regex(., '^0[789][01][0-9]{8}([ ]*,[ ]*0[789][01][0-9]{8})*$') or .=''",
    constraint_message: "Enter valid 11-digit Nigerian phone number(s), comma-separated.",
    appearance: "multiline",
  }));
  survey.push(q({ type: "select_one yes_no", name: "cdd_from_community", label: "Is the CDD from this Community/Settlement?", appearance: "minimal" }));
  survey.push(q({ type: "end_group", name: "grp_comm_cdd_end" }));

  // Section 11: Notes
  survey.push(q({ type: "begin_group", name: "grp_comm_logistics_notes", label: "### 📝 Additional Notes", appearance: "field-list" }));
  survey.push(q({ type: "text", name: "additional_notes", label: "Notes / observations for this community", appearance: "multiline" }));
  survey.push(q({ type: "end_group", name: "grp_comm_logistics_notes_end" }));

  survey.push(q({ type: "end_repeat", name: "community_repeat_end" }));

  // ─── CHOICES ───────────────────────────────────────────────────────────
  const choices: Row[] = [CHOICES_HEADER as unknown as Row];
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
    ["nutrition", "Nutrition"], ["dmpa_sc", "DMPA-SC"], ["other", "Other"],
  ]) pushChoice({ list_name: "campaign_type", name: n, label: l });

  for (const [n, l] of [
    ["census", "National Census"], ["projected", "Census Projection"],
    ["community_leader", "Community Leader Estimate"], ["health_facility", "Health Facility Records"],
    ["household_listing", "Household Listing"], ["survey", "Survey/Study"], ["other", "Other"],
  ]) pushChoice({ list_name: "population_source", name: n, label: l });

  for (const [n, l] of [
    ["flat", "🌾 Flat"], ["hilly", "⛰️ Hilly"], ["mountainous", "🗻 Mountainous"],
    ["riverine", "🌊 Riverine"], ["swampy", "🏝️ Swampy"], ["desert", "🏜️ Desert"], ["forest", "🌳 Forest"],
  ]) pushChoice({ list_name: "terrain_type", name: n, label: l });
  for (const [n, l] of [
    ["accessible", "🛣️ Accessible"], ["hard_to_reach", "⚠️ Hard to Reach"],
    ["inaccessible", "⛔ Inaccessible"], ["seasonal", "🌦️ Seasonal Access"],
  ]) pushChoice({ list_name: "accessibility", name: n, label: l });
  for (const [n, l] of [
    ["cleared", "🟢 Cleared"], ["partial", "🟡 Partial"],
    ["not_cleared", "🔴 Not Cleared"], ["unknown", "⚪ Unknown"],
  ]) pushChoice({ list_name: "security_clearance", name: n, label: l });

  // ── Dynamic State → LGA → Ward cascade ──
  const allStates = getAllStates();
  const targetStates = scopedStates.length > 0
    ? allStates.filter((s) => scopedStates.includes(s))
    : allStates;

  onProgress?.({ phase: "states", done: 0, total: targetStates.length });
  const stateIdByName = new Map<string, string>();
  targetStates.forEach((s) => {
    const id = sanitize(s);
    stateIdByName.set(s, id);
    pushChoice({ list_name: "states", name: id, label: s });
  });

  targetStates.forEach((s, i) => {
    const sid = stateIdByName.get(s)!;
    for (const lga of getLGAsForState(s)) {
      const lid = sanitize(`${sid}__${sanitize(lga)}`);
      pushChoice({ list_name: "lgas", name: lid, label: lga, state: sid });
      for (const ward of getWardsForLGA(s, lga)) {
        const wid = sanitize(`${lid}__${sanitize(ward)}`);
        pushChoice({ list_name: "wards", name: wid, label: ward, lga: lid });
      }
    }
    onProgress?.({ phase: "states", done: i + 1, total: targetStates.length });
  });
  onProgress?.({ phase: "flhfs", done: targetStates.length, total: targetStates.length });
  onProgress?.({ phase: "communities", done: targetStates.length, total: targetStates.length });

  // ─── SETTINGS ──────────────────────────────────────────────────────────
  onProgress?.({ phase: "assemble", done: 0, total: 1 });
  const versionStamp = versionInt != null
    ? String(versionInt)
    : new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12);
  const formTitle = projectName ? `${projectName} — Geo Microplanning` : "Geo Microplanning";
  const formId = "amehnities_geo_microplanning";
  const settings: Row[] = [
    SETTINGS_HEADER as unknown as Row,
    [formTitle, formId, versionStamp, "theme-grid no-text-transform", "yes"],
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
  assertCoverPageIsHomeImageOnly(wb);
  onProgress?.({ phase: "done", done: 1, total: 1 });
  return wb;
}

/**
 * Runtime guard: verifies the generated XLSForm's first user-visible screen
 * contains ONLY the full-page `home` cover image and no additional controls.
 */
const META_TYPES = new Set([
  "start", "end", "today", "deviceid", "username", "phonenumber", "phone_number", "audit",
]);
const WRAPPER_TYPES = new Set(["begin_group", "end_group"]);
const WRAPPER_NAMES = new Set(["grp_welcome", "grp_welcome_end"]);
export function assertCoverPageIsHomeImageOnly(wb: XLSX.WorkBook): void {
  const sheet = wb.Sheets["survey"];
  if (!sheet) throw new Error("[xlsform-cover] survey sheet missing");
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
  const header = rows[0] ?? [];
  const idx = (h: string) => header.indexOf(h);
  const iType = idx("type"), iName = idx("name"), iLabel = idx("label"),
    iImage = idx("image"), iAppearance = idx("appearance"), iHint = idx("hint");
  if (iType < 0 || iName < 0 || iLabel < 0 || iImage < 0) {
    throw new Error("[xlsform-cover] survey header missing required columns");
  }
  const first = rows.slice(1).find((r) => {
    const t = String(r[iType] ?? "").trim();
    const n = String(r[iName] ?? "").trim();
    if (!t || META_TYPES.has(t)) return false;
    if (WRAPPER_TYPES.has(t) && WRAPPER_NAMES.has(n)) return false;
    return true;
  });

  if (!first) throw new Error("[xlsform-cover] no visible cover row found");
  const type = String(first[iType] ?? "").trim();
  const name = String(first[iName] ?? "").trim();
  const label = String(first[iLabel] ?? "");
  const image = String(first[iImage] ?? "").trim();
  const appearance = String(first[iAppearance] ?? "").trim();
  const hint = String(first[iHint] ?? "").trim();
  if (type !== "note") {
    throw new Error(`[xlsform-cover] first visible row must be a note (got "${type}")`);
  }
  if (name !== "welcome_cover_note") {
    throw new Error(`[xlsform-cover] first visible row must be welcome_cover_note (got "${name}")`);
  }
  if (image !== "home") {
    throw new Error(`[xlsform-cover] cover image must be "home" (got "${image}")`);
  }
  if (!/no-label/.test(appearance)) {
    throw new Error(`[xlsform-cover] cover row must use "no-label" appearance (got "${appearance}")`);
  }
  if (label.trim() !== "") {
    throw new Error(`[xlsform-cover] cover label must be blank/whitespace only (got "${label}")`);
  }
  if (hint !== "") {
    throw new Error(`[xlsform-cover] cover row must have no hint (got "${hint}")`);
  }
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
