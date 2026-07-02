// Fresh SARMAAN visual identity for the Integrated Supervisory Checklist &
// Learning Dashboard. Deliberately distinct from the app's executive navy —
// a warm, confident humanitarian palette (jade + gold + coral on cream).
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/sora/800.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";

export const SARMAAN = {
  jade: "#0F7B6C",
  jadeDark: "#0A574C",
  jadeDeep: "#073B33",
  gold: "#F4B12B",
  goldSoft: "#FBE3A6",
  coral: "#EF6C4D",
  coralSoft: "#FBD9CF",
  sky: "#3AA0B8",
  plum: "#7C4D8F",
  cream: "#FBF7EF",
  creamPanel: "#FFFDF8",
  ink: "#0B211C",
  inkSoft: "#4B5A54",
  line: "#E7E0D2",
  headingFont: "'Sora', system-ui, sans-serif",
  bodyFont: "'Manrope', system-ui, sans-serif",
} as const;

/** Ordered chart palette drawn from the SARMAAN identity. */
export const SARMAAN_SERIES = [
  SARMAAN.jade,
  SARMAAN.gold,
  SARMAAN.coral,
  SARMAAN.sky,
  SARMAAN.plum,
  SARMAAN.jadeDark,
  "#C6893F",
  "#9AA83B",
];

/**
 * Navy executive theme matching the SARMAAN ACSM Integrated Supervisory
 * Checklist & Dashboard reference design (dark navy sidebar, teal accent,
 * clean light canvas). Used by the dedicated checklist + dashboard screens.
 */
export const NAVY = {
  sidebar: "#0A2540",
  sidebarDeep: "#071A30",
  sidebar2: "#0E2E52",
  sidebarActive: "#123E68",
  sidebarLine: "rgba(255,255,255,0.08)",
  sidebarText: "#E7EEF6",
  sidebarSub: "#8FA6BF",
  teal: "#12B5A5",
  tealDeep: "#0E8D80",
  canvas: "#F4F7FB",
  panel: "#FFFFFF",
  panel2: "#F8FAFD",
  line: "#E4EAF1",
  ink: "#14263B",
  inkSoft: "#5B6E85",
  primary: "#0B5CAB",
  primarySoft: "#E8F1FB",
  good: "#16A34A",
  warn: "#D97706",
  bad: "#DC2626",
  gold: "#F4B12B",
  violet: "#7C4D8F",
  headingFont: "'Sora', system-ui, sans-serif",
  bodyFont: "'Manrope', system-ui, sans-serif",
} as const;

/** Status band colouring for KPI quality scores. */
export function qualityBand(pct: number): { label: string; color: string } {
  if (pct >= 75) return { label: "Good", color: NAVY.good };
  if (pct >= 50) return { label: "Moderate", color: NAVY.warn };
  return { label: "Needs Improvement", color: NAVY.bad };
}

/** The 12 checklist modules exactly as in the reference UI. */
export const CHECKLIST_MODULES: {
  n: number;
  title: string;
  blurb: string;
  fields: string[];
}[] = [
  { n: 1, title: "Visit Profile", blurb: "Supervisor, location, activity and visit type.", fields: ["supervisor_name", "state", "lga", "community", "type_of_visit"] },
  { n: 2, title: "Activity Planning", blurb: "Was the activity planned, resourced and de-risked?", fields: ["score_planning"] },
  { n: 3, title: "Stakeholder Advocacy", blurb: "Decision-makers reached, commitments and follow-up.", fields: ["score_stakeholder"] },
  { n: 4, title: "LGA Advocacy", blurb: "Policy, traditional, religious and facility engagement.", fields: [] },
  { n: 5, title: "Community Dialogue & Social Mobilization", blurb: "Turnout, inclusion, participation and misconceptions.", fields: ["num_dialogue_sessions", "num_women", "score_participation"] },
  { n: 6, title: "Non-Compliance Resolution", blurb: "Refusal cases, root causes, resolution and escalation.", fields: ["cases_identified", "cases_resolved", "score_noncompliance"] },
  { n: 7, title: "Awareness & IEC", blurb: "Radio, announcements, reach and material quality.", fields: ["radio_reach", "score_awareness"] },
  { n: 8, title: "Evidence / MOV Verification", blurb: "Records, consistency, photos and MOV rating.", fields: ["overall_evidence_quality", "score_evidence"] },
  { n: 9, title: "Successes & Challenges", blurb: "Biggest wins, bottlenecks, causes and prevention.", fields: ["challenge_category"] },
  { n: 10, title: "Learning & Adaptive Management", blurb: "Lessons, stop / start / continue, evidence and owners.", fields: ["score_learning"] },
  { n: 11, title: "Action Plan & Follow-up", blurb: "Concrete action points, owners, priority and due dates.", fields: ["action_status", "score_followup"] },
  { n: 12, title: "Final Supervisor Judgement", blurb: "Eight category scores, /80 total and signature.", fields: ["total_score"] },
];

/** Dashboard left-nav items exactly as in the reference UI. */
export const DASHBOARD_NAV = [
  "Executive Overview",
  "Activity Completion & Coverage",
  "Stakeholder Advocacy",
  "Community Dialogue",
  "Non-Compliance Resolution",
  "Awareness & IEC",
  "Evidence & Data Quality",
  "Challenges & Root Causes",
  "Learning & Adaptive Management",
  "Corrective Actions & Follow-Up",
] as const;

/** Detects the Integrated Supervisory Checklist & Learning Dashboard form. */
export function isSupervisoryLearningForm(input: {
  settings?: unknown;
  name?: string;
}): boolean {
  const s = (input.settings || {}) as Record<string, unknown>;
  if (s.presetKey === "supervisory_learning") return true;
  return /integrated supervisory checklist & learning/i.test(input.name || "");
}

/** The 13 sections (A–M) with short field guidance shown on the launcher. */
export const SUPERVISORY_SECTIONS: {
  code: string;
  title: string;
  blurb: string;
}[] = [
  { code: "A", title: "Supervisor & Visit Information", blurb: "Who, where and what activity is being supervised." },
  { code: "B", title: "Activity Planning & Preparedness", blurb: "Was the activity planned, resourced and de-risked?" },
  { code: "C", title: "Stakeholder Advocacy", blurb: "Decision-makers reached, commitments and follow-up." },
  { code: "D", title: "LGA-Level Advocacy", blurb: "Policy, traditional, religious and facility engagement." },
  { code: "E", title: "Community Dialogue & Mobilization", blurb: "Turnout, inclusion, participation and misconceptions." },
  { code: "F", title: "Non-Compliance Resolution", blurb: "Refusal cases, root causes, resolution and escalation." },
  { code: "G", title: "Awareness & IEC Materials", blurb: "Radio, announcements, reach and material quality." },
  { code: "H", title: "Means of Verification & Data Quality", blurb: "Records, consistency, photos and MOV rating." },
  { code: "I", title: "Implementation Success", blurb: "Biggest wins, strongest activity, practices to scale." },
  { code: "J", title: "Challenges, Bottlenecks & Risks", blurb: "What went wrong, cause, resolution and prevention." },
  { code: "K", title: "Learning & Adaptive Management", blurb: "Lessons, stop / start / continue, evidence and owners." },
  { code: "L", title: "Action Plan & Follow-Up", blurb: "Concrete action points, owners, priority and due dates." },
  { code: "M", title: "Supervisor Final Judgement", blurb: "Eight category scores, /80 total and signature." },
];
