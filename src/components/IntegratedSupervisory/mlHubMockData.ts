/**
 * Mock KoboToolbox XLSForm-shaped records powering the
 * "Integrated MDA Supervisory & ML Intelligence Hub" demo modules.
 * Field names mirror the live Kobo schema exactly.
 */

export interface MlHubRecord {
  "Parent Submission ID": string;
  "Submission Date": string;
  "Submitted By": string;
  State: string;
  LGA: string;
  Ward: string;
  FLHF: string;
  Community: string;
  Designation: string;
  "MDA Campaign Type": "Schistosomiasis" | "Lymphatic Filariasis" | "Onchocerciasis" | "Soil-Transmitted Helminths";
  "Status of MDA": "Ongoing" | "Not Started" | "Completed" | "Halted";
  "Any SAE Complain?": "Yes" | "No";
  "GPS of Household": { lat: number; long: number; altitude: number; accuracy: number };
  "Were you OFFERED the medicine(s)": "Yes" | "No";
  "Did you SWALLOW the medicine(s)?": "Yes" | "No";
  "Reason respondent SWALLOWED": string;
  "Reason respondent DID NOT SWALLOW": string;
  "Water source used mostly": "Tubewell/Borehole" | "Dug well" | "Surface water" | "Piped water";
  "Latrine type used mostly": "VIP latrine" | "Pit latrine" | "Open defecation" | "Flush toilet";
  "Domestic dirty water disposal": "Soak-away" | "Open drainage" | "Compound surface" | "Stream";
}

const gps = (lat: number, long: number, accuracy: number) => ({
  lat, long, altitude: 320 + Math.round((lat * 7) % 60), accuracy,
});

export const ML_HUB_RECORDS: MlHubRecord[] = [
  {
    "Parent Submission ID": "SUB-88214", "Submission Date": "2026-07-31T08:12:00Z",
    "Submitted By": "a.mustapha", State: "Yobe", LGA: "Bade", Ward: "Gwio-Kura",
    FLHF: "Gwio-Kura PHC", Community: "Gwio-Kura A", Designation: "Independent Monitor",
    "MDA Campaign Type": "Schistosomiasis", "Status of MDA": "Ongoing", "Any SAE Complain?": "No",
    "GPS of Household": gps(12.7681, 10.8112, 6),
    "Were you OFFERED the medicine(s)": "Yes", "Did you SWALLOW the medicine(s)?": "No",
    "Reason respondent SWALLOWED": "", "Reason respondent DID NOT SWALLOW": "Afraid of the side effects I heard about",
    "Water source used mostly": "Surface water", "Latrine type used mostly": "Open defecation",
    "Domestic dirty water disposal": "Stream",
  },
  {
    "Parent Submission ID": "SUB-88215", "Submission Date": "2026-07-31T08:41:00Z",
    "Submitted By": "a.mustapha", State: "Yobe", LGA: "Bade", Ward: "Gwio-Kura",
    FLHF: "Gwio-Kura PHC", Community: "Gwio-Kura B", Designation: "Independent Monitor",
    "MDA Campaign Type": "Schistosomiasis", "Status of MDA": "Not Started", "Any SAE Complain?": "No",
    "GPS of Household": gps(12.7712, 10.8155, 8),
    "Were you OFFERED the medicine(s)": "No", "Did you SWALLOW the medicine(s)?": "No",
    "Reason respondent SWALLOWED": "", "Reason respondent DID NOT SWALLOW": "CDD never came to our side of the village",
    "Water source used mostly": "Dug well", "Latrine type used mostly": "Pit latrine",
    "Domestic dirty water disposal": "Open drainage",
  },
  {
    "Parent Submission ID": "SUB-88220", "Submission Date": "2026-07-31T09:05:00Z",
    "Submitted By": "f.okon", State: "Akwa Ibom", LGA: "Eket", Ward: "Central 5",
    FLHF: "Eket Central Health Post", Community: "Afaha Eket", Designation: "State Supervisor",
    "MDA Campaign Type": "Lymphatic Filariasis", "Status of MDA": "Ongoing", "Any SAE Complain?": "Yes",
    "GPS of Household": gps(4.6412, 7.9271, 5),
    "Were you OFFERED the medicine(s)": "Yes", "Did you SWALLOW the medicine(s)?": "Yes",
    "Reason respondent SWALLOWED": "CDD explained the benefit clearly", "Reason respondent DID NOT SWALLOW": "",
    "Water source used mostly": "Surface water", "Latrine type used mostly": "Pit latrine",
    "Domestic dirty water disposal": "Stream",
  },
  {
    "Parent Submission ID": "SUB-88221", "Submission Date": "2026-07-31T09:33:00Z",
    "Submitted By": "f.okon", State: "Akwa Ibom", LGA: "Eket", Ward: "Central 5",
    FLHF: "Eket Central Health Post", Community: "Idua Eket", Designation: "State Supervisor",
    "MDA Campaign Type": "Lymphatic Filariasis", "Status of MDA": "Ongoing", "Any SAE Complain?": "Yes",
    "GPS of Household": gps(4.6455, 7.9310, 12),
    "Were you OFFERED the medicine(s)": "Yes", "Did you SWALLOW the medicine(s)?": "No",
    "Reason respondent SWALLOWED": "", "Reason respondent DID NOT SWALLOW": "I had not eaten breakfast that morning",
    "Water source used mostly": "Dug well", "Latrine type used mostly": "Open defecation",
    "Domestic dirty water disposal": "Compound surface",
  },
  {
    "Parent Submission ID": "SUB-88230", "Submission Date": "2026-07-31T10:02:00Z",
    "Submitted By": "s.bello", State: "Kano", LGA: "Dala", Ward: "Kabuwaya",
    FLHF: "Dala Comprehensive HC", Community: "Kabuwaya East", Designation: "LGA Supervisor",
    "MDA Campaign Type": "Onchocerciasis", "Status of MDA": "Completed", "Any SAE Complain?": "No",
    "GPS of Household": gps(12.0104, 8.5001, 4),
    "Were you OFFERED the medicine(s)": "Yes", "Did you SWALLOW the medicine(s)?": "Yes",
    "Reason respondent SWALLOWED": "Took it last round with no problem", "Reason respondent DID NOT SWALLOW": "",
    "Water source used mostly": "Tubewell/Borehole", "Latrine type used mostly": "VIP latrine",
    "Domestic dirty water disposal": "Soak-away",
  },
  {
    "Parent Submission ID": "SUB-88231", "Submission Date": "2026-07-31T10:26:00Z",
    "Submitted By": "s.bello", State: "Kano", LGA: "Dala", Ward: "Kabuwaya",
    FLHF: "Dala Comprehensive HC", Community: "Kabuwaya West", Designation: "LGA Supervisor",
    "MDA Campaign Type": "Onchocerciasis", "Status of MDA": "Completed", "Any SAE Complain?": "No",
    "GPS of Household": gps(12.0138, 8.4962, 7),
    "Were you OFFERED the medicine(s)": "Yes", "Did you SWALLOW the medicine(s)?": "Yes",
    "Reason respondent SWALLOWED": "Village head announced it in the mosque", "Reason respondent DID NOT SWALLOW": "",
    "Water source used mostly": "Tubewell/Borehole", "Latrine type used mostly": "Flush toilet",
    "Domestic dirty water disposal": "Soak-away",
  },
  {
    "Parent Submission ID": "SUB-88240", "Submission Date": "2026-07-31T11:14:00Z",
    "Submitted By": "j.danladi", State: "Jigawa", LGA: "Hadejia", Ward: "Yankoli",
    FLHF: "Hadejia General Hospital", Community: "Yankoli North", Designation: "Independent Monitor",
    "MDA Campaign Type": "Soil-Transmitted Helminths", "Status of MDA": "Halted", "Any SAE Complain?": "No",
    "GPS of Household": gps(12.4501, 10.0402, 9),
    "Were you OFFERED the medicine(s)": "No", "Did you SWALLOW the medicine(s)?": "No",
    "Reason respondent SWALLOWED": "", "Reason respondent DID NOT SWALLOW": "Our religious leader advised against it",
    "Water source used mostly": "Dug well", "Latrine type used mostly": "Pit latrine",
    "Domestic dirty water disposal": "Open drainage",
  },
  {
    "Parent Submission ID": "SUB-88241", "Submission Date": "2026-07-31T11:47:00Z",
    "Submitted By": "j.danladi", State: "Jigawa", LGA: "Hadejia", Ward: "Yankoli",
    FLHF: "Hadejia General Hospital", Community: "Yankoli South", Designation: "Independent Monitor",
    "MDA Campaign Type": "Soil-Transmitted Helminths", "Status of MDA": "Ongoing", "Any SAE Complain?": "No",
    "GPS of Household": gps(12.4443, 10.0361, 45),
    "Were you OFFERED the medicine(s)": "Yes", "Did you SWALLOW the medicine(s)?": "No",
    "Reason respondent SWALLOWED": "", "Reason respondent DID NOT SWALLOW": "The team came when everyone was at the farm",
    "Water source used mostly": "Surface water", "Latrine type used mostly": "Open defecation",
    "Domestic dirty water disposal": "Stream",
  },
  {
    "Parent Submission ID": "SUB-88250", "Submission Date": "2026-07-31T12:20:00Z",
    "Submitted By": "m.audu", State: "Yobe", LGA: "Bade", Ward: "Sugum",
    FLHF: "Sugum PHC", Community: "Sugum Central", Designation: "Ward Focal Person",
    "MDA Campaign Type": "Schistosomiasis", "Status of MDA": "Ongoing", "Any SAE Complain?": "No",
    "GPS of Household": gps(12.6902, 10.9004, 6),
    "Were you OFFERED the medicine(s)": "Yes", "Did you SWALLOW the medicine(s)?": "Yes",
    "Reason respondent SWALLOWED": "Wanted protection for my children", "Reason respondent DID NOT SWALLOW": "",
    "Water source used mostly": "Piped water", "Latrine type used mostly": "VIP latrine",
    "Domestic dirty water disposal": "Soak-away",
  },
  {
    "Parent Submission ID": "SUB-88251", "Submission Date": "2026-07-31T12:58:00Z",
    "Submitted By": "m.audu", State: "Yobe", LGA: "Bade", Ward: "Sugum",
    FLHF: "Sugum PHC", Community: "Sugum Riverside", Designation: "Ward Focal Person",
    "MDA Campaign Type": "Schistosomiasis", "Status of MDA": "Ongoing", "Any SAE Complain?": "Yes",
    "GPS of Household": gps(12.6871, 10.9052, 5),
    "Were you OFFERED the medicine(s)": "Yes", "Did you SWALLOW the medicine(s)?": "Yes",
    "Reason respondent SWALLOWED": "Free medicine and CDD is my neighbour", "Reason respondent DID NOT SWALLOW": "",
    "Water source used mostly": "Surface water", "Latrine type used mostly": "Open defecation",
    "Domestic dirty water disposal": "Stream",
  },
];

/** Spatial cold-spots produced by the DBSCAN / Bayesian spatial layer. */
export const COLDSPOTS = [
  { state: "Yobe", lga: "Bade", ward: "Gwio-Kura", progress: 21, households: 412, teams: 2, risk: "Critical" as const },
  { state: "Jigawa", lga: "Hadejia", ward: "Yankoli", progress: 34, households: 388, teams: 1, risk: "Critical" as const },
  { state: "Akwa Ibom", lga: "Eket", ward: "Central 5", progress: 48, households: 502, teams: 3, risk: "High" as const },
  { state: "Yobe", lga: "Bade", ward: "Sugum", progress: 57, households: 274, teams: 2, risk: "Moderate" as const },
];

/** NLP topic model output over free-text refusal reasons. */
export const REFUSAL_TOPICS = [
  { topic: "Fear of side effects", count: 148, sentiment: -0.62 },
  { topic: "Religious / Mistrust", count: 113, sentiment: -0.71 },
  { topic: "Poor timing", count: 96, sentiment: -0.28 },
  { topic: "No breakfast", count: 74, sentiment: -0.19 },
  { topic: "Team never arrived", count: 51, sentiment: -0.55 },
];

export const WARD_NLP = [
  { ward: "Gwio-Kura", dominant: "Fear of side effects", share: 46, sentiment: -0.64 },
  { ward: "Yankoli", dominant: "Religious / Mistrust", share: 52, sentiment: -0.73 },
  { ward: "Central 5", dominant: "No breakfast", share: 38, sentiment: -0.21 },
  { ward: "Sugum", dominant: "Poor timing", share: 33, sentiment: -0.26 },
];

/** Pharmacovigilance stream. */
export const SAE_STREAM = [
  {
    id: "SAE-1042", at: "2026-07-31T12:58:00Z", flhf: "Sugum PHC", community: "Sugum Riverside",
    campaign: "Schistosomiasis", symptom: "Persistent vomiting + dizziness (3 cases)", batch: "PZQ-B2291",
    severity: "Critical" as const, oddsRatio: 3.41, ciLow: 1.92, ciHigh: 6.05,
  },
  {
    id: "SAE-1039", at: "2026-07-31T09:33:00Z", flhf: "Eket Central Health Post", community: "Idua Eket",
    campaign: "Lymphatic Filariasis", symptom: "Facial swelling reported by 2 respondents", batch: "IVM-A1180",
    severity: "High" as const, oddsRatio: 2.18, ciLow: 1.11, ciHigh: 4.29,
  },
  {
    id: "SAE-1031", at: "2026-07-30T16:05:00Z", flhf: "Dala Comprehensive HC", community: "Kabuwaya East",
    campaign: "Onchocerciasis", symptom: "Mild rash, resolved on site", batch: "IVM-A1180",
    severity: "Low" as const, oddsRatio: 0.94, ciLow: 0.41, ciHigh: 2.02,
  },
];

/** WASH × compliance risk matrix. */
export const WASH_MATRIX = [
  { source: "Surface water", VIP: 71, Pit: 48, Open: 29, Flush: 82 },
  { source: "Dug well", VIP: 78, Pit: 57, Open: 36, Flush: 85 },
  { source: "Tubewell/Borehole", VIP: 91, Pit: 82, Open: 61, Flush: 94 },
  { source: "Piped water", VIP: 95, Pit: 88, Open: 68, Flush: 97 },
];

export const WASH_HOTSPOTS = [
  { state: "Akwa Ibom", lga: "Eket", ward: "Central 5", community: "Idua Eket", compliance: 29, water: "Surface water", latrine: "Open defecation" },
  { state: "Yobe", lga: "Bade", ward: "Gwio-Kura", community: "Gwio-Kura A", compliance: 31, water: "Surface water", latrine: "Open defecation" },
  { state: "Jigawa", lga: "Hadejia", ward: "Yankoli", community: "Yankoli South", compliance: 37, water: "Surface water", latrine: "Open defecation" },
  { state: "Yobe", lga: "Bade", ward: "Sugum", community: "Sugum Riverside", compliance: 44, water: "Surface water", latrine: "Open defecation" },
];

/** Isolation Forest anomaly log. */
export interface AnomalyRow {
  id: string; submission: string; enumerator: string; ward: string;
  reason: string; score: number; status: "Pending" | "Approved" | "Quarantined";
}

export const ANOMALIES: AnomalyRow[] = [
  { id: "AN-501", submission: "SUB-88241", enumerator: "j.danladi", ward: "Yankoli", reason: "GPS accuracy 45 m exceeds 20 m threshold", score: 0.88, status: "Pending" },
  { id: "AN-502", submission: "SUB-88215", enumerator: "a.mustapha", ward: "Gwio-Kura", reason: "Impossible travel speed between consecutive forms (118 km/h)", score: 0.94, status: "Pending" },
  { id: "AN-503", submission: "SUB-88231", enumerator: "s.bello", ward: "Kabuwaya", reason: "Identical answer pattern repeated across 6 households", score: 0.79, status: "Pending" },
  { id: "AN-504", submission: "SUB-88220", enumerator: "f.okon", ward: "Central 5", reason: "Form completed in 47 s (median 6 m 12 s)", score: 0.72, status: "Pending" },
];
