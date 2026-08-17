/**
 * Integrated MDA Supervisory Checklist — canonical XLSForm schema.
 *
 * Parsed 1:1 from the published XLSForm (`survey`, `choices`, `settings`).
 * Everything downstream (raw grid column ordering, dashboard aggregation,
 * exports and Kobo field-mapping status) reads from this single source of
 * truth so a Kobo schema change only ever needs to be reflected here.
 *
 * Kobo returns group-prefixed JSON keys (e.g. `group_cy5ao47/State`) and the
 * repeat roster as a nested array (`Respondent_Interview: [...]`). The helpers
 * below resolve leaf names regardless of group prefix and unroll the roster
 * into flat, independently filterable respondent rows that retain full parent
 * metadata.
 */

export type ChecklistFieldType =
  | "select_one" | "select_multiple" | "text" | "integer"
  | "geopoint" | "image";

export interface ChecklistField {
  /** XLSForm question name (leaf, no group prefix). */
  name: string;
  /** Human label, HTML stripped. */
  label: string;
  type: ChecklistFieldType;
  /** choices list_name, when a select. */
  list?: string;
  /** Lives inside the `Respondent_Interview` repeat group. */
  repeat?: boolean;
  /** Logical section for dashboards / grouped column toggles. */
  section: string;
}

export const REPEAT_GROUP = "Respondent_Interview";

/** Kobo system identifiers, always surfaced first in the grid. */
export const SYSTEM_FIELDS: { key: string; label: string }[] = [
  { key: "_id", label: "Submission ID" },
  { key: "_uuid", label: "Submission UUID" },
  { key: "_submission_time", label: "Submission Date" },
  { key: "_submitted_by", label: "Submitted By" },
];

/** Exact question sequence as defined in the XLSForm survey sheet. */
export const CHECKLIST_FIELDS: ChecklistField[] = [
  // Geographic Location
  { name: "State", label: "State", type: "select_one", list: "States", section: "Geographic Location" },
  { name: "LGA", label: "LGA", type: "select_one", list: "LGAs", section: "Geographic Location" },
  { name: "Ward", label: "Ward", type: "select_one", list: "Wards", section: "Geographic Location" },
  { name: "FLHF", label: "FLHF", type: "text", section: "Geographic Location" },
  { name: "COMMUNITIES", label: "Community", type: "text", section: "Geographic Location" },
  { name: "GPS", label: "GPS", type: "geopoint", section: "Geographic Location" },

  // Supervisor / Monitor
  { name: "Designation", label: "Designation", type: "select_one", list: "rz5qe06", section: "Supervisor / Monitor" },
  { name: "Independent_Monitor_s_Name", label: "Independent Monitor's Name", type: "select_one", list: "im", section: "Supervisor / Monitor" },
  { name: "Name_of_Supervisor", label: "Name of Supervisor", type: "text", section: "Supervisor / Monitor" },

  // Campaign
  { name: "MDA_Campaign_Type", label: "MDA Campaign Type", type: "select_one", list: "av9ct84", section: "MDA Campaign" },
  { name: "Specify_Multiple_Drug_Therapy", label: "Specify Multiple Drug Therapy", type: "text", section: "MDA Campaign" },

  // Inventory
  { name: "Is_Medicine_Inventory_Availabl", label: "Is Medicine Inventory Available", type: "select_one", list: "it3mz10", section: "Inventory" },
  { name: "Attach_photo_of_medicine_inventory", label: "Attach photo of medicine inventory", type: "image", section: "Inventory" },

  // Community information
  { name: "Are_there_trained_CDDs_Commun", label: "Are there CDDs in the Community", type: "select_one", list: "db2cj50", section: "Community Information" },
  { name: "how_many_teachers_cdds_school_", label: "How many CDDs in Community", type: "integer", section: "Community Information" },
  { name: "If_no_CDI_CDD_why", label: "If no CDD, why?", type: "text", section: "Community Information" },

  // CDD interview
  { name: "Has_CDI_CDD_been_trained", label: "Has CDD been trained?", type: "select_one", list: "jt2cb13", section: "CDD Interview" },
  { name: "If_NO_training_for_CDI_CDD_why", label: "If NO training for Teacher/CDD, why?", type: "text", section: "CDD Interview" },
  { name: "Did_CDI_CDD_receive_stipends", label: "Has CDD received stipends at the time of visit?", type: "select_one", list: "is5gf65", section: "CDD Interview" },
  { name: "Where_did_CDI_CDD_receive_stip", label: "Where did CDD receive stipends from?", type: "select_multiple", list: "ss0fq36", section: "CDD Interview" },
  { name: "State_HANDS_Incentives", label: "What (how much) was received from State/HANDS?", type: "text", section: "CDD Interview" },
  { name: "School_Community_Incentive", label: "What (how much) was received from School/Community?", type: "text", section: "CDD Interview" },
  { name: "What_how_much_was_d_from_other_sources", label: "What (how much) was received from other sources?", type: "text", section: "CDD Interview" },

  // Treatment register
  { name: "Is_Treatment_Register_Availabl", label: "Is Treatment Register Available?", type: "select_one", list: "np9ss49", section: "Treatment Register" },
  { name: "If_NO_Treatment_Register_why", label: "If NO Treatment Register, why?", type: "text", section: "Treatment Register" },
  { name: "Has_Census_Update_been_conducted", label: "Has Census Update been conducted?", type: "select_one", list: "ih74l46", section: "Treatment Register" },
  { name: "Are_entries_in_Register_CORRECT", label: "Are entries in Register CORRECT?", type: "select_one", list: "cw6hh51", section: "Treatment Register" },
  { name: "Take_photo_of_any_sheet_on_the_Register", label: "Take photo of any sheet on the Register", type: "image", section: "Treatment Register" },

  // Dose poles / posters
  { name: "Is_Dose_Pole_Available", label: "Is Dose Pole Available?", type: "select_one", list: "xt2ka86", section: "Dose Poles / Posters" },
  { name: "Does_CDI_CDD_Know_how_to_use_Dose_Pole", label: "Does CDD know how to use Dose Pole", type: "select_one", list: "mq42c80", section: "Dose Poles / Posters" },
  { name: "Are_any_NTD_posters_the_School_Community", label: "Are any NTD posters displayed anywhere in the Community?", type: "select_one", list: "aq8iy80", section: "Dose Poles / Posters" },

  // Treatment status + medicine
  { name: "has_treatment_commenced", label: "Has Treatment commenced in the Community?", type: "select_one", list: "xs1je30", section: "Treatment Status" },
  { name: "Does_CDI_CDD_have_sufficient_d", label: "Does CDD have sufficient medicine(s)?", type: "select_one", list: "vc2zf57", section: "Medicine Availability" },
  { name: "Specify_the_medicine_s_are_NOT_SUFFICIENT", label: "Specify the medicine(s) that is/are NOT SUFFICIENT", type: "text", section: "Medicine Availability" },

  // SAE
  { name: "Any_SAE_Complain", label: "Any SAE Complain?", type: "select_one", list: "ye21z70", section: "Adverse Events (SAE)" },
  { name: "If_YES_what_type_of_SAE", label: "If YES, what type of SAE?", type: "select_multiple", list: "uq4by95", section: "Adverse Events (SAE)" },
  { name: "Specify_the_OTHER_type_of_SAE", label: "Specify the OTHER type of SAE", type: "text", section: "Adverse Events (SAE)" },

  // WASH (community level)
  { name: "Are_all_sources_of_water_used_", label: "Are all water sources WITHIN this school/community?", type: "select_one", list: "lu4ml41", section: "WASH (Community)" },
  { name: "What_type_s_of_wate_WITHIN_the_community", label: "Water source types WITHIN the school/community", type: "select_multiple", list: "fh5fz34", section: "WASH (Community)" },
  { name: "What_type_s_of_wate_UTSIDE_the_community", label: "Water source types OUTSIDE the school/community", type: "select_multiple", list: "qg9ae67", section: "WASH (Community)" },

  // Comments
  { name: "Any_comment_on_CDI_CDD_Interview", label: "Any comment on CDD/Teacher Interview?", type: "select_one", list: "iy64y62", section: "Comments" },
  { name: "Comment_on_CDI_CDD_Interview_Here_", label: "Comment on CDD/Teacher Interview Here", type: "text", section: "Comments" },

  // Respondent repeat
  { name: "GPS_of_Household", label: "GPS of Household", type: "geopoint", repeat: true, section: "Respondent" },
  { name: "Name_of_Respondent", label: "Name of Respondent", type: "text", repeat: true, section: "Respondent" },
  { name: "Were_you_OFFERED_the_medicine_s", label: "Were you OFFERED the medicine(s)", type: "select_one", list: "vk6yi12", repeat: true, section: "Respondent" },
  { name: "swallow", label: "Did you SWALLOW the medicine(s)?", type: "select_one", list: "kz6ls25", repeat: true, section: "Respondent" },
  { name: "Reason_respondent_SWALLOWED_th", label: "Reason respondent SWALLOWED the medicine(s)", type: "select_one", list: "xw5bg40", repeat: true, section: "Respondent" },
  { name: "Reason_respondent_DID_NOT_SWAL", label: "Reason respondent DID NOT SWALLOW the medicine(s)", type: "select_one", list: "kb7ca99", repeat: true, section: "Respondent" },
  { name: "OTHER_REASON_why_res_LOWED_the_medicine_s", label: "OTHER REASON why respondent SWALLOWED the medicine(s)", type: "text", repeat: true, section: "Respondent" },
  { name: "OTHER_REASON_why_res_ALLOW_the_medicine_s", label: "OTHER REASON why respondent DID NOT SWALLOW the medicine(s)", type: "text", repeat: true, section: "Respondent" },
  { name: "What_water_source_i_your_class_household", label: "Water source used mostly in class/household", type: "select_multiple", list: "fh5fz34", repeat: true, section: "Respondent WASH" },
  { name: "What_type_of_Laterin_our_school_household", label: "Latrine type used mostly in school/household", type: "select_one", list: "ku6gm25", repeat: true, section: "Respondent WASH" },
  { name: "How_do_you_Dispose_D_your_class_household", label: "How domestic dirty water is disposed in class/household", type: "select_multiple", list: "cu0zq68", repeat: true, section: "Respondent WASH" },

  // Final status
  { name: "Status_of_MDA", label: "Status of MDA", type: "select_one", list: "ex5hk33", section: "MDA Status" },
];

/** Choice code → human label, per list_name (geo cascades resolve verbatim). */
export const CHECKLIST_CHOICES: Record<string, Record<string, string>> = {
  rz5qe06: {
    Independent_Monitor: "Independent Monitor",
    State_Monitor: "State Monitor",
    LGA_Monitor: "LGA Monitor",
    FLHF_Monitor: "FLHF Monitor",
    HANDS_Staff: "HANDS Staff",
    "Sightsavers,Cbm_e.tc.": "Sightsavers, CBM e.tc.",
    FMoH: "FMoH",
  },
  av9ct84: {
    schistosomiasis: "Schistosomiasis",
    onchocerciasis_only: "Onchocerciasis Only",
    onchocerciasis_lymphatic_filar: "Onchocerciasis/Lymphatic Filariasis",
    soil_transmitted_helminths: "Soil Transmitted Helminths",
    schistosomiasis_soil_transmitt: "Schistosomiasis/Soil Transmitted Helminths",
    trachoma: "Trachoma",
    multiple_drug_therapy: "Multiple Drug Therapy",
  },
  it3mz10: { yes: "Yes", no: "No" },
  db2cj50: { Yes: "Yes", No: "No", Yes_but_unavailable_for_interview: "Yes, but unavailable for interview" },
  jt2cb13: { Yes: "Yes", No: "No" },
  is5gf65: { Yes: "Yes", No: "No" },
  ss0fq36: { "State/HANDS": "State/HANDS", "School/Community": "School/Community", Other: "Other" },
  np9ss49: { Yes: "Yes", No: "No" },
  ih74l46: { Yes: "Yes", No: "No" },
  cw6hh51: { Yes: "Yes", No: "No", Unavailable_for_vetting_1: "Unavailable for vetting" },
  xt2ka86: { Yes: "Yes", No: "No" },
  mq42c80: { Yes: "Yes", No: "No" },
  aq8iy80: { Yes: "Yes", No: "No" },
  xs1je30: { yes: "Yes", no: "No" },
  vc2zf57: {
    "Yes,_all_are_sufficient": "Yes, all are sufficient",
    "Some_are_sufficient,_and_some_are_not": "Some are sufficient, and some are not",
    "No,_all_are_insufficient": "No, all are insufficient",
  },
  ye21z70: { Yes: "Yes", No: "No" },
  uq4by95: {
    Stomach_Pain: "Stomach Pain", Headache: "Headache", Diahorrea: "Diahorrea",
    Dizziness: "Dizziness", Others: "Others",
  },
  lu4ml41: {
    "Yes,_all_are_within_the_school/community": "Yes, all are within the school/community",
    "Some_are_within,_and_some_are_outside": "Some are within, and some are outside",
    "No,_all_are_outside_the_school/community": "No, all are outside the school/community",
  },
  fh5fz34: {
    "Piped_water_/Tubewell/_Borehole_inside_d": "Piped water /Tubewell/ Borehole inside dwelling",
    "Tubewell/Borehole_outside_dwelling": "Tubewell/Borehole outside dwelling",
    Protected_dug_well: "Protected dug well",
    Unprotected_dug_well: "Unprotected dug well",
    Protected_Spring: "Protected Spring",
    Unprotected_Spring: "Unprotected Spring",
    Rainwater_collection: "Rainwater collection",
    "Water_vendor_(Mai_ruwa)": "Water vendor (Mai ruwa)",
    "Surface_water_(e.g._river,_dam,_lake,_ca": "Surface water (e.g. river, dam, lake, canal)",
  },
  qg9ae67: {
    "Piped_water_/Tubewell/_Borehole_inside_d": "Piped water /Tubewell/ Borehole inside dwelling",
    "Tubewell/Borehole_outside_dwelling": "Tubewell/Borehole outside dwelling",
    Protected_dug_well: "Protected dug well",
    Unprotected_dug_well: "Unprotected dug well",
    Protected_Spring: "Protected Spring",
    Unprotected_Spring: "Unprotected Spring",
    Rainwater_collection: "Rainwater collection",
    "Water_vendor_(Mai_ruwa)": "Water vendor (Mai ruwa)",
    "Surface_water_(e.g._river,_dam,_lake,_ca": "Surface water (e.g. river, dam, lake, canal)",
  },
  ku6gm25: {
    Piped_Flush_WC: "Piped Flush WC",
    Pour_Flush_WC: "Pour Flush WC",
    Pit_Laterine: "Pit Laterine",
    No_facilities_or_bush: "No facilities or bush",
  },
  cu0zq68: {
    Bush_beside_dwelling: "Bush beside dwelling",
    Pit_beside_dwelling: "Pit beside dwelling",
    Gutter_beside_dwelling: "Gutter beside dwelling",
    "Floor_around_dwelling_(i.e._backyard_or_": "Floor around dwelling (i.e. backyard or compound)",
    "Sink_&_closed_septic_tank_system": "Sink & closed septic tank system",
  },
  vk6yi12: {
    Offered_all_required_1: "Offered all required",
    "Offered_(but_not_all_required)": "Offered (but not all required)",
    Not_offered_any_required_1: "Not offered any required",
  },
  kz6ls25: {
    Swallowed_all_offered_1: "Swallowed all offered",
    "Swallowed_(but_not_all_offered)": "Swallowed (but not all offered)",
    Did_not_swallow_any_offered_1: "Did not swallow any offered",
  },
  xw5bg40: {
    "Fear_of_disease_(preventive)": "Fear of disease (preventive)",
    "To_treat_disease_(curative)": "To treat disease (curative)",
    Because_it_was_given_free_1: "Because it was given free",
    "Useful_Information_from_CDI/CDD": "Useful Information from CDI/CDD",
    Other: "Other",
  },
  kb7ca99: {
    Fear_of_side_effects_1: "Fear of side effects",
    Bad_taste_1: "Bad taste",
    Not_sick_1: "Not sick",
    Not_enough_information_given_on_the_medi: "Not enough information given on the medicine(s)",
    Other: "Other",
  },
  iy64y62: { Yes: "Yes", No: "No" },
  ex5hk33: { not_started: "Not Started", ongoing: "Ongoing", halted: "Halted", completed: "Completed" },
  im: Object.fromEntries(
    Array.from({ length: 37 }, (_, i) => [`im${i + 1}`, `IM ${i + 1}`]),
  ),
};

export const FIELD_BY_NAME = new Map(CHECKLIST_FIELDS.map((f) => [f.name, f]));
export const PARENT_FIELDS = CHECKLIST_FIELDS.filter((f) => !f.repeat);
export const RESPONDENT_FIELDS = CHECKLIST_FIELDS.filter((f) => f.repeat);

// ---------------------------------------------------------------------------
// Value resolution
// ---------------------------------------------------------------------------

const normToken = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Resolve a raw Kobo answer into its human label (arrays joined). */
export function resolveChecklistValue(fieldName: string, raw: unknown): string {
  if (raw == null || raw === "") return "";
  const field = FIELD_BY_NAME.get(fieldName);
  const map = field?.list ? CHECKLIST_CHOICES[field.list] : undefined;

  const one = (v: unknown): string => {
    const s = String(v).trim();
    if (!s) return "";
    if (!map) return s;
    if (map[s]) return map[s];
    const hit = Object.keys(map).find((k) => normToken(k) === normToken(s));
    return hit ? map[hit] : s.replace(/^_+/, "").replace(/_/g, " ");
  };

  if (Array.isArray(raw)) return raw.map(one).filter(Boolean).join(", ");
  if (field?.type === "select_multiple" && typeof raw === "string") {
    return raw.split(/\s+/).filter(Boolean).map(one).join(", ");
  }
  if (typeof raw === "object") return JSON.stringify(raw);
  return one(raw);
}

/** Split a select_multiple answer into individual codes. */
export function splitMulti(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean);
  return String(raw).split(/\s+/).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Flattening pipeline
// ---------------------------------------------------------------------------

export interface ParentRow extends Record<string, unknown> {
  _id?: unknown;
  _uuid?: string;
  _submission_time?: string;
  _submitted_by?: string;
  /** number of respondent records unrolled from this submission */
  respondent_count: number;
}

export interface RespondentRow extends Record<string, unknown> {
  parent_uuid: string;
  parent_id: unknown;
  respondent_index: number;
  respondent_label: string;
}

/**
 * Build a leaf-name → value index for one Kobo submission, ignoring any
 * auto-generated group prefix (`group_cy5ao47/State` → `State`) and matching
 * case/punctuation-insensitively as a fallback.
 */
function leafIndex(obj: any, out = new Map<string, unknown>()): Map<string, unknown> {
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const leaf = k.split("/").pop() as string;
    if (v && typeof v === "object" && !Array.isArray(v)) { leafIndex(v, out); continue; }
    if (!out.has(leaf) || out.get(leaf) == null || out.get(leaf) === "") out.set(leaf, v);
    const n = normToken(leaf);
    if (!out.has(`~${n}`)) out.set(`~${n}`, v);
  }
  return out;
}

const pick = (idx: Map<string, unknown>, name: string): unknown => {
  const direct = idx.get(name);
  if (direct != null && direct !== "") return direct;
  return idx.get(`~${normToken(name)}`) ?? null;
};

/** Kobo may name the new supervisor question in a few ways — accept them all. */
export const SUPERVISOR_ALIASES = [
  "Name_of_Supervisor", "Name_of_the_Supervisor", "Supervisor_Name",
  "Supervisors_Name", "Supervisor_s_Name", "Name_of_Supervisors", "Supervisor",
];

/** Locate the respondent repeat array on a submission, whatever it is named. */
function findRepeatArray(row: any): any[] {
  const target = normToken(REPEAT_GROUP);
  let best: any[] | null = null;
  const walk = (o: any) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      const leaf = normToken(String(k).split("/").pop() || "");
      if (Array.isArray(v) && v.every((i) => i && typeof i === "object" && !Array.isArray(i))) {
        if (leaf === target) { best = v as any[]; return; }
        // structural fallback: an object-array containing respondent fields
        const keys = v.length ? Object.keys(v[0] as object).map((x) => normToken(x.split("/").pop() || "")) : [];
        const score = RESPONDENT_FIELDS.filter((f) => keys.includes(normToken(f.name))).length;
        if (score >= 2 && !best) best = v as any[];
        continue;
      }
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(row);
  return best ?? [];
}

/** Metadata copied onto every flattened respondent row. */
export const PARENT_CONTEXT_KEYS = [
  "_id", "_uuid", "_submission_time", "_submitted_by",
  "State", "LGA", "Ward", "FLHF", "COMMUNITIES",
  "Designation", "Independent_Monitor_s_Name", "MDA_Campaign_Type",
  "has_treatment_commenced", "Status_of_MDA", "Any_SAE_Complain",
] as const;

export interface ChecklistDataset {
  parents: ParentRow[];
  respondents: RespondentRow[];
}

/** Normalize raw Kobo submissions into parent + flattened respondent rows. */
export function buildChecklistDataset(rawResults: any[] | null | undefined): ChecklistDataset {
  const parents: ParentRow[] = [];
  const respondents: RespondentRow[] = [];

  for (const raw of rawResults ?? []) {
    const idx = leafIndex(raw);
    const repeat = findRepeatArray(raw);

    const parent: ParentRow = { respondent_count: repeat.length };
    for (const s of SYSTEM_FIELDS) parent[s.key] = raw?.[s.key] ?? null;
    parent._geolocation = raw?._geolocation ?? null;
    parent._attachments = raw?._attachments ?? null;
    parent._validation_status = raw?._validation_status ?? null;
    for (const f of PARENT_FIELDS) parent[f.name] = pick(idx, f.name);
    if (parent.Name_of_Supervisor == null || parent.Name_of_Supervisor === "") {
      for (const alias of SUPERVISOR_ALIASES) {
        const v = pick(idx, alias);
        if (v != null && v !== "") { parent.Name_of_Supervisor = v; break; }
      }
    }
    parents.push(parent);

    repeat.forEach((item, i) => {
      const ridx = leafIndex(item);
      const row: RespondentRow = {
        parent_uuid: String(raw?._uuid ?? ""),
        parent_id: raw?._id ?? null,
        respondent_index: i + 1,
        respondent_label: `Respondent #${i + 1}`,
      };
      for (const k of PARENT_CONTEXT_KEYS) row[k] = parent[k] ?? null;
      for (const f of RESPONDENT_FIELDS) row[f.name] = pick(ridx, f.name);
      respondents.push(row);
    });
  }

  return { parents, respondents };
}

// ---------------------------------------------------------------------------
// Column definitions for the grid / exports
// ---------------------------------------------------------------------------

export interface GridColumn {
  key: string;
  label: string;
  section: string;
  field?: ChecklistField;
}

/** Raw submission view — exact XLSForm question order, system fields first. */
export const RAW_COLUMNS: GridColumn[] = [
  ...SYSTEM_FIELDS.map((s) => ({ key: s.key, label: s.label, section: "Submission Metadata" })),
  ...PARENT_FIELDS.map((f) => ({ key: f.name, label: f.label, section: f.section, field: f })),
  { key: "respondent_count", label: "Respondents Interviewed", section: "Respondent" },
];

/** Flattened view — parent metadata + repeat index + respondent questions. */
export const FLAT_COLUMNS: GridColumn[] = [
  { key: "parent_id", label: "Parent Submission ID", section: "Parent Metadata" },
  { key: "parent_uuid", label: "Parent Submission UUID", section: "Parent Metadata" },
  { key: "_submission_time", label: "Submission Date", section: "Parent Metadata" },
  { key: "_submitted_by", label: "Submitted By", section: "Parent Metadata" },
  { key: "respondent_label", label: "Respondent Index", section: "Parent Metadata" },
  ...(["State", "LGA", "Ward", "FLHF", "COMMUNITIES", "Designation", "Independent_Monitor_s_Name", "MDA_Campaign_Type", "has_treatment_commenced", "Status_of_MDA", "Any_SAE_Complain"] as const)
    .map((n) => {
      const f = FIELD_BY_NAME.get(n)!;
      return { key: n, label: f.label, section: "Parent Context", field: f };
    }),
  ...RESPONDENT_FIELDS.map((f) => ({ key: f.name, label: f.label, section: f.section, field: f })),
];

/** Display a cell value using the choice labels. */
export function displayCell(col: GridColumn, row: Record<string, unknown>): string {
  const v = row[col.key];
  if (v == null || v === "") return "—";
  if (col.key === "_submission_time" && typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
  }
  if (col.field) return resolveChecklistValue(col.field.name, v) || "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ---------------------------------------------------------------------------
// Kobo field-mapping status (surfaced in Kobo Sync Settings)
// ---------------------------------------------------------------------------

export type MappingState = "mapped" | "missing_label" | "not_in_data" | "syncing";

export interface FieldMappingStatus {
  name: string;
  label: string;
  section: string;
  repeat: boolean;
  state: MappingState;
  /** Kobo path that satisfied the mapping, when found. */
  koboPath?: string;
  answered: number;
}

/**
 * Compare the declared checklist schema against what Kobo actually returned.
 * `syncing` is reported when no data has been pulled yet.
 */
export function computeMappingStatus(
  rawResults: any[] | null | undefined,
  survey?: any[] | null,
): FieldMappingStatus[] {
  const rows = rawResults ?? [];
  const surveyPaths = new Map<string, string>();
  for (const q of survey ?? []) {
    const nm = String(q?.name ?? "");
    if (!nm) continue;
    surveyPaths.set(normToken(nm), String(q?.$xpath || q?.name));
  }

  const answered = new Map<string, number>();
  for (const raw of rows) {
    const idx = leafIndex(raw);
    for (const f of PARENT_FIELDS) {
      const v = pick(idx, f.name);
      if (v != null && v !== "") answered.set(f.name, (answered.get(f.name) ?? 0) + 1);
    }
    for (const item of findRepeatArray(raw)) {
      const ridx = leafIndex(item);
      for (const f of RESPONDENT_FIELDS) {
        const v = pick(ridx, f.name);
        if (v != null && v !== "") answered.set(f.name, (answered.get(f.name) ?? 0) + 1);
      }
    }
  }

  return CHECKLIST_FIELDS.map((f) => {
    const n = answered.get(f.name) ?? 0;
    const koboPath = surveyPaths.get(normToken(f.name));
    let state: MappingState;
    if (rows.length === 0) state = "syncing";
    else if (n > 0) state = "mapped";
    else if (koboPath) state = "missing_label";
    else state = "not_in_data";
    return { name: f.name, label: f.label, section: f.section, repeat: !!f.repeat, state, koboPath, answered: n };
  });
}
