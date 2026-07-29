// Kobo → microplan_entries auto-mapping registry.
//
// TARGET_FIELDS lists every microplan_entries column an admin can wire a Kobo
// question to. `computeAutoMap` normalizes names/aliases/labels so freshly
// inspected forms hit 100% coverage without manual clicking.
//
// Extracted from KoboFormConfigPanel so unit tests can assert the registry
// covers every question the XLSForm generator ships.

export interface KoboField {
  name: string;
  type: string;
  label: string;
}

export const TARGET_FIELDS: Array<{ key: string; label: string; aliases?: string[] }> = [
  // Identity / project
  { key: "project_id", label: "Project ID", aliases: ["amehnities_project_id", "project"] },
  { key: "year_of_microplanning", label: "Year of Microplanning", aliases: ["year"] },
  { key: "campaign_type", label: "Campaign Type" },
  { key: "population_source", label: "Population Source" },
  // Admin cascade
  { key: "state", label: "State" },
  { key: "lga", label: "LGA", aliases: ["local_government_area", "lga_name"] },
  { key: "ward", label: "Ward", aliases: ["ward_name"] },
  // FLHF
  { key: "flhf_name", label: "FLHF Name", aliases: ["flhf", "health_facility"] },
  { key: "flhf_incharge_name", label: "FLHF In-charge Name", aliases: ["incharge_name"] },
  { key: "flhf_incharge_phone", label: "FLHF In-charge Phone", aliases: ["incharge_phone"] },
  { key: "flhf_latitude", label: "FLHF Latitude", aliases: ["flhf_lat"] },
  { key: "flhf_longitude", label: "FLHF Longitude", aliases: ["flhf_lng", "flhf_lon"] },
  // Community
  { key: "community_name", label: "Community", aliases: ["community"] },
  { key: "community_leader_name", label: "Community Leader" },
  { key: "community_leader_phone", label: "Community Leader Phone" },
  { key: "community_latitude", label: "Community Latitude", aliases: ["community_lat"] },
  { key: "community_longitude", label: "Community Longitude", aliases: ["community_lng"] },
  { key: "community_distance_to_flhf_km", label: "Community → FLHF Distance (km)" },
  // Settlement
  { key: "settlement_name", label: "Settlement", aliases: ["settlement"] },
  { key: "settlement_mai_unguwa", label: "Mai Unguwa (Settlement Head)" },
  { key: "settlement_latitude", label: "Settlement Latitude" },
  { key: "settlement_longitude", label: "Settlement Longitude" },
  { key: "settlement_distance_to_flhf_km", label: "Settlement → FLHF Distance (km)" },
  // Context
  { key: "terrain_type", label: "Terrain Type" },
  { key: "accessibility", label: "Accessibility" },
  { key: "security_clearance", label: "Security Clearance" },
  // Population
  { key: "estimated_total_population", label: "Estimated Total Population", aliases: ["total_population"] },


  { key: "estimated_children_0_4", label: "Children 0–4 years" },
  { key: "estimated_children_5_14", label: "Children 5–14 years" },
  { key: "estimated_adults_15_plus", label: "Adults 15+ years" },
  { key: "number_of_households", label: "Number of Households", aliases: ["households"] },
  // Trachoma
  { key: "trachoma_0_5_months", label: "Trachoma 0–5 months" },
  { key: "trachoma_6m_6y", label: "Trachoma 6m–6y" },
  { key: "trachoma_7_14y", label: "Trachoma 7–14y" },
  { key: "trachoma_15_plus", label: "Trachoma 15+" },
  // PWD
  { key: "pwd_total", label: "PWD Total" },
  { key: "pwd_visual", label: "PWD Visual" },
  { key: "pwd_hearing", label: "PWD Hearing" },
  { key: "pwd_physical", label: "PWD Physical" },
  { key: "pwd_intellectual", label: "PWD Intellectual" },
  { key: "pwd_communication", label: "PWD Communication" },
  { key: "pwd_selfcare", label: "PWD Self-care" },
  { key: "pwd_albinism", label: "PWD Albinism" },
  // CDDs
  { key: "cdd_names", label: "CDD Names" },
  { key: "cdd_phone_numbers", label: "CDD Phone Numbers" },
  { key: "cdd_from_community", label: "CDD From Community" },
  // Meta
  { key: "notes", label: "Additional Notes" },
  { key: "kobo_submission_id", label: "Kobo Submission ID", aliases: ["_id", "_uuid"] },
];

export const normToken = (s: string): string =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export const computeAutoMap = (fields: KoboField[]): Record<string, string> => {
  const byName = new Map<string, string>();
  const byLabel = new Map<string, string>();
  for (const f of fields) {
    byName.set(normToken(f.name), f.name);
    byLabel.set(normToken(f.label), f.name);
  }
  const out: Record<string, string> = {};
  for (const t of TARGET_FIELDS) {
    const candidates = [t.key, ...(t.aliases ?? [])].map(normToken);
    for (const c of candidates) {
      const hit = byName.get(c) ?? byLabel.get(c);
      if (hit) { out[t.key] = hit; break; }
    }
  }
  return out;
};
