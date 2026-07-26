// Complete XLSForm exporter for the Geo-enabled Microplanning entry form.
//
// Produces an ODK/KoboToolbox-standard .xlsx (`survey`, `choices`, `settings`)
// that mirrors every field, skip logic, calculation and validation from
// `MicroplanEntryForm.tsx`, and embeds the FULL GRID3 cascaded lists of
// FLHFs, Communities and Settlements (with GPS coordinates when available).
//
// Data collectors on KoboToolbox / ODK Collect get:
//   • Fully cascaded State → LGA → Ward → FLHF → Community → Settlement pickers
//   • Pre-populated GPS from GRID3 with the ability to override in the field
//   • "Other (specify manually)" free-text entry for FLHFs, Communities and
//     Settlements that don't appear in the dropdowns
//   • Auto-computed distances (community/settlement → FLHF) via ODK distance()
//   • Auto-computed total population from age disaggregation
//   • Range/regex constraints for years, phone numbers and non-negative counts
//
import * as XLSX from "xlsx";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import { getGrid3FullStateEntries } from "@/lib/grid3NigeriaData";

type Row = (string | number)[];

const slug = (s: string) =>
  String(s ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "x";

const SURVEY_HEADER = [
  "type", "name", "label", "hint", "required", "required_message",
  "relevant", "constraint", "constraint_message", "calculation",
  "choice_filter", "appearance", "default",
];

const CHOICES_HEADER = ["list_name", "name", "label", "state", "lga", "ward", "flhf", "community", "lat", "lng"];

const SETTINGS_HEADER = ["form_title", "form_id", "version", "default_language", "style"];

// A survey row builder that produces sparse arrays aligned to SURVEY_HEADER.
const q = (r: Partial<Record<(typeof SURVEY_HEADER)[number], string>>): Row =>
  SURVEY_HEADER.map((h) => (r as any)[h] ?? "");

// Choice row builder aligned to CHOICES_HEADER.
const ch = (r: Partial<Record<(typeof CHOICES_HEADER)[number], string | number>>): Row =>
  CHOICES_HEADER.map((h) => {
    const v = (r as any)[h];
    return v == null ? "" : v;
  });

// XLSForm expression that yields "<lat> <lng> 0 0" for the ODK distance() fn,
// or empty string when either coordinate is missing.
const geopointExpr = (lat: string, lng: string) =>
  `if(${lat}='' or ${lng}='', '', concat(${lat}, ' ', ${lng}, ' 0 0'))`;

export interface BuildProgress {
  phase: "states" | "flhfs" | "communities" | "assemble" | "done";
  done: number;
  total: number;
}

export async function buildMicroplanningXlsForm(
  onProgress?: (p: BuildProgress) => void,
): Promise<XLSX.WorkBook> {
  // ─── SURVEY ────────────────────────────────────────────────────────────
  const survey: Row[] = [SURVEY_HEADER as unknown as Row];

  // Metadata
  survey.push(q({ type: "start", name: "start" }));
  survey.push(q({ type: "end", name: "end" }));
  survey.push(q({ type: "today", name: "today" }));
  survey.push(q({ type: "deviceid", name: "deviceid" }));
  survey.push(q({ type: "username", name: "username" }));
  survey.push(q({ type: "phonenumber", name: "phonenumber" }));

  survey.push(q({
    type: "note", name: "intro",
    label: "**Amehnities — Geo-enabled Microplanning Entry**\n\nComplete each section. Cascaded State → LGA → Ward → FLHF → Community/Settlement is powered by GRID3. Where a name is missing, select **Other (specify manually)** to type it in.",
  }));

  // ── Section 1: Campaign & Year ──
  survey.push(q({ type: "begin_group", name: "campaign_year", label: "1. Campaign & Year", appearance: "field-list" }));
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

  // ── Section 2: Administrative Hierarchy (Cascaded) ──
  survey.push(q({ type: "begin_group", name: "admin_hierarchy", label: "2. Administrative Hierarchy (GRID3 cascade)", appearance: "field-list" }));
  survey.push(q({
    type: "select_one states", name: "state", label: "State", required: "yes",
    appearance: "minimal search",
  }));
  survey.push(q({
    type: "select_one lgas", name: "lga", label: "LGA / Local Government Area",
    required: "yes", choice_filter: "state=${state}", appearance: "minimal search",
  }));
  survey.push(q({
    type: "select_one wards", name: "ward", label: "Ward", required: "yes",
    choice_filter: "state=${state} and lga=${lga}", appearance: "minimal search",
  }));
  survey.push(q({ type: "end_group", name: "admin_hierarchy_end" }));

  // ── Section 3: FLHF ──
  survey.push(q({ type: "begin_group", name: "flhf_grp", label: "3. Frontline Health Facility (FLHF)", appearance: "field-list" }));
  survey.push(q({
    type: "select_one flhfs", name: "flhf_pick", label: "Name of FLHF (GRID3)",
    hint: "Type to search. Choose 'Other (specify manually)' if the FLHF is not listed.",
    required: "yes",
    choice_filter: "(state=${state} and lga=${lga} and ward=${ward}) or name='__other__'",
    appearance: "search autocomplete",
  }));
  survey.push(q({
    type: "text", name: "flhf_manual", label: "Other FLHF — type the exact name",
    required: "yes", relevant: "${flhf_pick} = '__other__'",
  }));
  survey.push(q({
    type: "calculate", name: "flhf_name",
    calculation: "if(${flhf_pick}='__other__', ${flhf_manual}, jr:choice-name(${flhf_pick}, '${flhf_pick}'))",
  }));
  survey.push(q({
    type: "calculate", name: "flhf_lat_grid3",
    calculation: "if(${flhf_pick}='' or ${flhf_pick}='__other__', '', instance('flhfs')/root/item[name=${flhf_pick}]/lat)",
  }));
  survey.push(q({
    type: "calculate", name: "flhf_lng_grid3",
    calculation: "if(${flhf_pick}='' or ${flhf_pick}='__other__', '', instance('flhfs')/root/item[name=${flhf_pick}]/lng)",
  }));
  survey.push(q({ type: "note", name: "flhf_grid3_note",
    label: "📍 GRID3 GPS: **${flhf_lat_grid3}, ${flhf_lng_grid3}** — capture below to override.",
    relevant: "${flhf_lat_grid3} != '' and ${flhf_lng_grid3} != ''",
  }));
  survey.push(q({
    type: "geopoint", name: "flhf_gps_override", label: "FLHF GPS (override — optional)",
    hint: "Leave blank to keep the GRID3 coordinates. Capture to override with the actual field location.",
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

  // ── Section 4: Community ──
  survey.push(q({ type: "begin_group", name: "community_grp", label: "4. Community", appearance: "field-list" }));
  survey.push(q({
    type: "select_one communities", name: "community_pick", label: "Community (GRID3)",
    hint: "Type to search. Choose 'Other (specify manually)' if the community is not listed.",
    required: "yes",
    choice_filter: "(state=${state} and lga=${lga} and ward=${ward}) or name='__other__'",
    appearance: "search autocomplete",
  }));
  survey.push(q({
    type: "text", name: "community_manual", label: "Other Community — type the exact name",
    required: "yes", relevant: "${community_pick} = '__other__'",
  }));
  survey.push(q({
    type: "calculate", name: "community_name",
    calculation: "if(${community_pick}='__other__', ${community_manual}, jr:choice-name(${community_pick}, '${community_pick}'))",
  }));
  survey.push(q({
    type: "calculate", name: "community_lat_grid3",
    calculation: "if(${community_pick}='' or ${community_pick}='__other__', '', instance('communities')/root/item[name=${community_pick}]/lat)",
  }));
  survey.push(q({
    type: "calculate", name: "community_lng_grid3",
    calculation: "if(${community_pick}='' or ${community_pick}='__other__', '', instance('communities')/root/item[name=${community_pick}]/lng)",
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
  survey.push(q({ type: "begin_group", name: "settlement_grp", label: "5. Settlement (optional)", appearance: "field-list" }));
  survey.push(q({
    type: "select_one settlements", name: "settlement_pick", label: "Settlement (GRID3)",
    hint: "Optional. Choose 'Other (specify manually)' to type a name.",
    choice_filter: "(state=${state} and lga=${lga} and ward=${ward}) or name='__other__'",
    appearance: "search autocomplete",
  }));
  survey.push(q({
    type: "text", name: "settlement_manual", label: "Other Settlement — type the exact name",
    relevant: "${settlement_pick} = '__other__'",
  }));
  survey.push(q({
    type: "calculate", name: "settlement_name",
    calculation: "if(${settlement_pick}='', '', if(${settlement_pick}='__other__', ${settlement_manual}, jr:choice-name(${settlement_pick}, '${settlement_pick}')))",
  }));
  survey.push(q({
    type: "calculate", name: "settlement_lat_grid3",
    calculation: "if(${settlement_pick}='' or ${settlement_pick}='__other__', '', instance('settlements')/root/item[name=${settlement_pick}]/lat)",
  }));
  survey.push(q({
    type: "calculate", name: "settlement_lng_grid3",
    calculation: "if(${settlement_pick}='' or ${settlement_pick}='__other__', '', instance('settlements')/root/item[name=${settlement_pick}]/lng)",
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
  survey.push(q({ type: "begin_group", name: "context_grp", label: "6. Terrain, Access & Security", appearance: "field-list" }));
  survey.push(q({ type: "select_one terrain_type", name: "terrain_type", label: "Type of Terrain", appearance: "minimal" }));
  survey.push(q({ type: "select_one accessibility", name: "accessibility", label: "Accessibility", appearance: "minimal" }));
  survey.push(q({ type: "select_one security_clearance", name: "security_clearance", label: "Security Clearance", appearance: "minimal" }));
  survey.push(q({ type: "end_group", name: "context_grp_end" }));

  // ── Section 7: Population Estimates ──
  survey.push(q({ type: "begin_group", name: "pop_grp", label: "7. Population Estimates", appearance: "field-list" }));
  survey.push(q({
    type: "integer", name: "estimated_children_0_4", label: "Children 0–4 years",
    constraint: ". >= 0", constraint_message: "Must be zero or greater.",
  }));
  survey.push(q({
    type: "integer", name: "estimated_children_5_14", label: "Children 5–14 years",
    constraint: ". >= 0", constraint_message: "Must be zero or greater.",
  }));
  survey.push(q({
    type: "integer", name: "estimated_adults_15_plus", label: "Adults 15+ years",
    constraint: ". >= 0", constraint_message: "Must be zero or greater.",
  }));
  survey.push(q({
    type: "calculate", name: "estimated_total_population",
    calculation: "coalesce(${estimated_children_0_4},0) + coalesce(${estimated_children_5_14},0) + coalesce(${estimated_adults_15_plus},0)",
  }));
  survey.push(q({
    type: "note", name: "pop_total_note",
    label: "**Estimated Total Population: ${estimated_total_population}** (auto-computed)",
  }));
  survey.push(q({
    type: "integer", name: "number_of_households", label: "Number of Households",
    constraint: ". >= 0", constraint_message: "Must be zero or greater.",
  }));
  survey.push(q({ type: "end_group", name: "pop_grp_end" }));

  // ── Section 8: Trachoma Age Disaggregation (optional) ──
  survey.push(q({ type: "begin_group", name: "trachoma_grp", label: "8. Trachoma Age Disaggregation (optional)", appearance: "field-list" }));
  survey.push(q({
    type: "select_one yes_no", name: "include_trachoma",
    label: "Include trachoma-specific age disaggregation?", appearance: "minimal", default: "no",
  }));
  const tracRel = "${include_trachoma} = 'yes'";
  survey.push(q({ type: "integer", name: "trachoma_0_5_months", label: "0–5 months", relevant: tracRel, constraint: ". >= 0" }));
  survey.push(q({ type: "integer", name: "trachoma_6m_6y", label: "6 months – 6 years", relevant: tracRel, constraint: ". >= 0" }));
  survey.push(q({ type: "integer", name: "trachoma_7_14y", label: "7–14 years", relevant: tracRel, constraint: ". >= 0" }));
  survey.push(q({ type: "integer", name: "trachoma_15_plus", label: "15+ years", relevant: tracRel, constraint: ". >= 0" }));
  survey.push(q({ type: "end_group", name: "trachoma_grp_end" }));

  // ── Section 9: Persons With Disability (PWD) ──
  survey.push(q({ type: "begin_group", name: "pwd_grp", label: "9. Persons With Disability (Disaggregation)", appearance: "field-list" }));
  const pwdFields: [string, string][] = [
    ["pwd_total", "PWD — Total"],
    ["pwd_visual", "Visual"], ["pwd_hearing", "Hearing"], ["pwd_physical", "Physical"],
    ["pwd_intellectual", "Intellectual"], ["pwd_communication", "Communication"],
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

  // Yes / No
  choices.push(ch({ list_name: "yes_no", name: "yes", label: "Yes" }));
  choices.push(ch({ list_name: "yes_no", name: "no", label: "No" }));

  // Campaign type
  for (const [n, l] of [
    ["ntd", "NTD (MDA)"], ["polio", "Polio (SIA)"], ["malaria", "Malaria (ITN/IRS)"],
    ["routine_immunization", "Routine Immunization"], ["covid19", "COVID-19 Vaccination"],
    ["nutrition", "Nutrition"], ["other", "Other"],
  ]) choices.push(ch({ list_name: "campaign_type", name: n, label: l }));

  // Population source
  for (const [n, l] of [
    ["census", "National Census"], ["projected", "Census Projection"],
    ["community_leader", "Community Leader Estimate"], ["health_facility", "Health Facility Records"],
    ["household_listing", "Household Listing"], ["survey", "Survey/Study"], ["other", "Other"],
  ]) choices.push(ch({ list_name: "population_source", name: n, label: l }));

  // Terrain / Access / Security
  for (const [n, l] of [
    ["flat", "Flat"], ["hilly", "Hilly"], ["mountainous", "Mountainous"],
    ["riverine", "Riverine"], ["swampy", "Swampy"], ["desert", "Desert"], ["forest", "Forest"],
  ]) choices.push(ch({ list_name: "terrain_type", name: n, label: l }));
  for (const [n, l] of [
    ["accessible", "Accessible"], ["hard_to_reach", "Hard to Reach"],
    ["inaccessible", "Inaccessible"], ["seasonal", "Seasonal Access"],
  ]) choices.push(ch({ list_name: "accessibility", name: n, label: l }));
  for (const [n, l] of [
    ["cleared", "Cleared"], ["partial", "Partial"], ["not_cleared", "Not Cleared"], ["unknown", "Unknown"],
  ]) choices.push(ch({ list_name: "security_clearance", name: n, label: l }));

  // ── GRID3 cascade — states / lgas / wards / flhfs / communities / settlements ──
  const states = getAllStates();
  const stateNameById = new Map<string, string>();
  const lgaNameById = new Map<string, string>();
  const wardNameById = new Map<string, string>();

  // States
  onProgress?.({ phase: "states", done: 0, total: states.length });
  states.forEach((s) => {
    const id = slug(s);
    stateNameById.set(s, id);
    choices.push(ch({ list_name: "states", name: id, label: s }));
  });

  // LGAs + Wards (from the admin registry — matches the entry form)
  states.forEach((s, i) => {
    const sid = stateNameById.get(s)!;
    for (const lga of getLGAsForState(s)) {
      const lid = `${sid}__${slug(lga)}`;
      lgaNameById.set(`${s}||${lga}`, lid);
      choices.push(ch({ list_name: "lgas", name: lid, label: lga, state: sid }));
      for (const ward of getWardsForLGA(s, lga)) {
        const wid = `${lid}__${slug(ward)}`;
        wardNameById.set(`${s}||${lga}||${ward}`, wid);
        choices.push(ch({ list_name: "wards", name: wid, label: ward, state: sid, lga: lid }));
      }
    }
    onProgress?.({ phase: "states", done: i + 1, total: states.length });
  });

  // Helper to resolve or synthesize a ward id when GRID3 uses names slightly
  // different from the admin registry (fallback: derive an id from names).
  const resolveWardId = (state: string, lga: string, ward: string): { sid: string; lid: string; wid: string } => {
    const sid = stateNameById.get(state) ?? slug(state);
    const lgaKey = `${state}||${lga}`;
    let lid = lgaNameById.get(lgaKey);
    if (!lid) {
      lid = `${sid}__${slug(lga)}`;
      lgaNameById.set(lgaKey, lid);
      choices.push(ch({ list_name: "lgas", name: lid, label: lga, state: sid }));
    }
    const wardKey = `${state}||${lga}||${ward}`;
    let wid = wardNameById.get(wardKey);
    if (!wid) {
      wid = `${lid}__${slug(ward)}`;
      wardNameById.set(wardKey, wid);
      choices.push(ch({ list_name: "wards", name: wid, label: ward, state: sid, lga: lid }));
    }
    return { sid, lid, wid };
  };

  // FLHFs — full GRID3 across every state
  const flhfSeen = new Set<string>();
  choices.push(ch({ list_name: "flhfs", name: "__other__", label: "Other (specify manually)" }));
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    onProgress?.({ phase: "flhfs", done: i, total: states.length });
    let entries: Awaited<ReturnType<typeof getGrid3FullStateEntries>> = [];
    try { entries = await getGrid3FullStateEntries("fac", s); } catch { entries = []; }
    let idx = 0;
    for (const e of entries) {
      const { sid, lid, wid } = resolveWardId(s, e.lga, e.ward);
      let base = `${wid}__f_${slug(e.name)}`;
      let id = base;
      while (flhfSeen.has(id)) { idx += 1; id = `${base}_${idx}`; }
      flhfSeen.add(id);
      choices.push(ch({
        list_name: "flhfs", name: id, label: e.name,
        state: sid, lga: lid, ward: wid,
        lat: e.latitude ?? "", lng: e.longitude ?? "",
      }));
    }
  }
  onProgress?.({ phase: "flhfs", done: states.length, total: states.length });

  // Communities & Settlements (GRID3 settlements shard). We emit each entry
  // into BOTH the `communities` and `settlements` lists so the picker works
  // whether an area is treated as a community or a settlement in the field.
  const commSeen = new Set<string>();
  const setSeen = new Set<string>();
  choices.push(ch({ list_name: "communities", name: "__other__", label: "Other (specify manually)" }));
  choices.push(ch({ list_name: "settlements", name: "__other__", label: "Other (specify manually)" }));
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    onProgress?.({ phase: "communities", done: i, total: states.length });
    let entries: Awaited<ReturnType<typeof getGrid3FullStateEntries>> = [];
    try { entries = await getGrid3FullStateEntries("set", s); } catch { entries = []; }
    let cIdx = 0, sIdx = 0;
    for (const e of entries) {
      const { sid, lid, wid } = resolveWardId(s, e.lga, e.ward);
      const nameSlug = slug(e.name);
      let cBase = `${wid}__c_${nameSlug}`;
      let cId = cBase;
      while (commSeen.has(cId)) { cIdx += 1; cId = `${cBase}_${cIdx}`; }
      commSeen.add(cId);
      choices.push(ch({
        list_name: "communities", name: cId, label: e.name,
        state: sid, lga: lid, ward: wid,
        lat: e.latitude ?? "", lng: e.longitude ?? "",
      }));

      let xBase = `${wid}__s_${nameSlug}`;
      let xId = xBase;
      while (setSeen.has(xId)) { sIdx += 1; xId = `${xBase}_${sIdx}`; }
      setSeen.add(xId);
      choices.push(ch({
        list_name: "settlements", name: xId, label: e.name,
        state: sid, lga: lid, ward: wid,
        lat: e.latitude ?? "", lng: e.longitude ?? "",
      }));
    }
  }
  onProgress?.({ phase: "communities", done: states.length, total: states.length });

  // ─── SETTINGS ──────────────────────────────────────────────────────────
  onProgress?.({ phase: "assemble", done: 0, total: 1 });
  const versionStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const settings: Row[] = [
    SETTINGS_HEADER as unknown as Row,
    ["Amehnities — Geo-enabled Microplanning Entry", "amehnities_geo_microplanning", versionStamp, "English (en)", "pages"],
  ];

  const wb = XLSX.utils.book_new();
  const surveySheet = XLSX.utils.aoa_to_sheet(survey);
  const choicesSheet = XLSX.utils.aoa_to_sheet(choices);
  const settingsSheet = XLSX.utils.aoa_to_sheet(settings);
  // Reasonable column widths for readability when opened in Excel
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

export async function downloadMicroplanningXlsForm(onProgress?: (p: BuildProgress) => void) {
  const wb = await buildMicroplanningXlsForm(onProgress);
  XLSX.writeFile(wb, `amehnities_geo_microplanning_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Serialize a workbook to a raw byte buffer + base64 string for storage/upload.
 * Returns both the Uint8Array (for local download via Blob) and base64 (for
 * DB persistence and edge-function upload to KoboToolbox).
 */
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
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
