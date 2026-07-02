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
