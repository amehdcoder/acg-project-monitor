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

/**
 * Per-section accent hues. Each checklist section is themed with its own
 * distinct colour, used for the rose-flower backdrop and section accents so
 * every module feels visually unique while staying within one design system.
 */
export const SECTION_HUES: string[] = [
  "#0F7B6C", // jade
  "#3AA0B8", // sky
  "#7C4D8F", // plum
  "#0B5CAB", // blue
  "#EF6C4D", // coral
  "#C0392B", // deep red
  "#F4B12B", // gold
  "#12B5A5", // teal
  "#2E8B57", // sea green
  "#8E44AD", // violet
  "#D35400", // pumpkin
  "#16A085", // green teal
  "#B5179E", // magenta
];

/** Names of legacy identity questions removed from the checklist body. */
export const REMOVED_CHECKLIST_QUESTIONS = new Set<string>([
  "supervisor_name",
  "date_of_supervision",
  "supervisor_designation",
]);

export interface ModuleGuidance {
  code: string;
  title: string;
  purpose: string;
  whoToAsk: string;
  whatToCheck: string;
  howToCollect: string;
  scoring?: string;
  tips: string[];
}

/**
 * Detailed builder / supervisor guidance for every module, distilled from the
 * Integrated Supervisory Checklist & Learning Dashboard reference document.
 * Surfaced inside the "Checklist Guidance & Resources" panel at the top of the
 * module navigator.
 */
export const MODULE_GUIDANCE: ModuleGuidance[] = [
  {
    code: "A",
    title: "Supervisor & Visit Information",
    purpose:
      "Establish exactly what was supervised, where, and how it was verified so every downstream score is anchored to a real, located visit.",
    whoToAsk: "Implementing team lead, facility in-charge, community entry point (CHW / volunteer).",
    whatToCheck:
      "Geography is set from the location cascade (State → LGA → Ward → FLHF → Community → Settlement). Confirm the GPS is captured on site and the visit type matches what actually happened.",
    howToCollect: "Direct observation, GPS capture on arrival, and the State-driven location cascade.",
    tips: [
      "Capture GPS while physically at the activity location — not in the vehicle or afterwards.",
      "Select every activity actually supervised; leave out those you only heard about.",
      "Record persons interviewed by role, not just by name.",
    ],
  },
  {
    code: "B",
    title: "Activity Planning & Preparedness",
    purpose: "Judge whether the activity was deliberately planned, resourced and de-risked before implementation.",
    whoToAsk: "Team lead and the officer responsible for the workplan.",
    whatToCheck: "Workplan inclusion, clear objective, defined target, assigned roles, tools ready and anticipated barriers with mitigation.",
    howToCollect: "Review workplan, activity plan, and pre-activity checklists.",
    scoring: "Each preparedness item scores 2 (Yes) / 1 (Partly) / 0 (No).",
    tips: [
      "A plan that only exists verbally is not a plan — look for a written or digital record.",
      "Ask what could have gone wrong and whether a mitigation was ready.",
    ],
  },
  {
    code: "C",
    title: "Stakeholder Advocacy",
    purpose: "Verify that the right decision-makers were reached and that commitments were recorded and followed up.",
    whoToAsk: "Advocacy lead, and where possible a stakeholder who was engaged.",
    whatToCheck: "Right level of decision-maker, inclusion, use of data, recorded commitments, assigned responsibilities and agreed follow-up.",
    howToCollect: "Meeting minutes, attendance / sign-in sheets, commitment registers, photos.",
    scoring: "Quality items score 2 / 1 / 0. Courtesy visits do not count as high-level advocacy.",
    tips: [
      "A commitment with no named owner and deadline is not actionable — flag it.",
      "Probe for at least one concrete implementation advantage the advocacy produced.",
    ],
  },
  {
    code: "D",
    title: "LGA-Level Advocacy",
    purpose: "Assess engagement of policy, traditional, religious and facility actors at LGA level and whether it translated into support.",
    whoToAsk: "LGA focal person, traditional / religious leaders, facility staff.",
    whatToCheck: "Whether LGA actors understood their role, committed to named actions, activated community entry structures and supported mobilization.",
    howToCollect: "Minutes, action-point registers, direct interviews and observation of support during implementation.",
    tips: [
      "Distinguish promised support from delivered support — record unmet commitments.",
      "Identify the single most useful and least responsive stakeholder group and why.",
    ],
  },
  {
    code: "E",
    title: "Community Dialogue & Social Mobilization",
    purpose: "Evaluate turnout, inclusion, genuine participation and how misconceptions were handled.",
    whoToAsk: "Facilitator, community leaders and a sample of participants.",
    whatToCheck: "Venue accessibility, gender / youth / PWD representation, active vs passive participation, misconceptions identified and correctly addressed.",
    howToCollect: "Observation, attendance disaggregated by sex / age, and post-session interviews.",
    scoring: "Facilitation quality items score 2 / 1 / 0.",
    tips: [
      "Count participation, not just attendance — questions and contributions matter.",
      "Record what the community taught the team that was not obvious before.",
    ],
  },
  {
    code: "F",
    title: "Non-Compliance Resolution",
    purpose: "Track refusal / non-compliance cases from identification through root cause to resolution or escalation.",
    whoToAsk: "CDDs, supervisors, and where appropriate the affected household or leader.",
    whatToCheck: "Cases documented, true root cause (not simply 'refused'), resolution method, satisfaction, follow-up date and escalation of pending cases.",
    howToCollect: "Line lists / registers, direct conversation, and resolution logs.",
    scoring: "Resolution quality items score 2 / 1 / 0; resolution must be respectful and non-coercive.",
    tips: [
      "'Refused' is a symptom, not a root cause — dig for fear, rumour, religious or trust drivers.",
      "Confirm whether the issue is individual, household or community-wide.",
    ],
  },
  {
    code: "G",
    title: "Awareness & IEC Materials",
    purpose: "Verify awareness channels used (radio, town / religious announcements), estimated reach and material quality.",
    whoToAsk: "Communications / IEC focal person and community members.",
    whatToCheck: "Broadcasts aired, station, language, estimated reach, and the accuracy / appropriateness of IEC materials.",
    howToCollect: "Broadcast logs, sample recordings, physical IEC materials and community recall.",
    tips: [
      "Estimate reach conservatively and note the basis for the estimate.",
      "Check that materials are in the correct local language and culturally appropriate.",
    ],
  },
  {
    code: "H",
    title: "Means of Verification & Data Quality",
    purpose: "Confirm that records exist, are consistent, and are backed by verifiable evidence.",
    whoToAsk: "Records / M&E focal person and team lead.",
    whatToCheck: "Availability and legibility of records, internal consistency, presence of photos / attendance, and overall MOV rating.",
    howToCollect: "Register review, cross-checking numbers across documents, and photo evidence.",
    scoring: "Rate overall evidence quality; inconsistent numbers lower the MOV score.",
    tips: [
      "Cross-check the same figure across two documents — mismatches signal data-quality risk.",
      "Ensure names / designations on sign-in sheets are legible.",
    ],
  },
  {
    code: "I",
    title: "Implementation Success",
    purpose: "Capture the biggest wins and the strongest practices worth scaling.",
    whoToAsk: "Team lead and community stakeholders.",
    whatToCheck: "The single most successful activity and the practice most worth replicating elsewhere.",
    howToCollect: "Structured interview and observation.",
    tips: ["Be specific — describe the practice concretely enough that another team could copy it."],
  },
  {
    code: "J",
    title: "Challenges, Bottlenecks & Risks",
    purpose: "Document what went wrong, the underlying cause, how it was handled and how to prevent recurrence.",
    whoToAsk: "Team lead and affected implementers.",
    whatToCheck: "The main bottleneck, its category, whether it was resolved, and the prevention measure identified.",
    howToCollect: "Interview and review of any incident notes.",
    tips: ["Separate the visible problem from its underlying cause — prevention targets the cause."],
  },
  {
    code: "K",
    title: "Learning & Adaptive Management",
    purpose: "Turn the visit into an explicit lesson with stop / start / continue actions and named owners.",
    whoToAsk: "Team lead and supervisor jointly.",
    whatToCheck: "Clear lessons, evidence behind them, and concrete stop / start / continue decisions with owners.",
    howToCollect: "Reflective discussion documented on the spot.",
    scoring: "Learning quality items score 2 / 1 / 0.",
    tips: ["A lesson without an owner and an action is just an observation — assign both."],
  },
  {
    code: "L",
    title: "Action Plan & Follow-Up",
    purpose: "Convert findings into concrete, owned, prioritized and time-bound action points.",
    whoToAsk: "Supervisor with the implementing team.",
    whatToCheck: "Each action has an owner, a priority and a due date, and the status of prior actions is updated.",
    howToCollect: "Action-point register.",
    tips: ["Every action point must be SMART — vague actions never get done."],
  },
  {
    code: "M",
    title: "Supervisor Final Judgement",
    purpose: "Consolidate the eight category scores into an overall / 80 judgement and sign off.",
    whoToAsk: "Supervisor (self-completed).",
    whatToCheck: "That each category score reflects the evidence gathered and that the total is honest.",
    howToCollect: "Aggregate section scores and provide a signature.",
    scoring: "Eight categories, each scored, summed to a maximum of 80.",
    tips: ["Score against evidence, not impressions — the signature attests to the whole visit."],
  },
];

/* ------------------------------------------------------------------ */
/* Immersive 6-chapter narrative arc                                   */
/*                                                                     */
/* The 13 raw supervision modules (A–M) are experienced by a real     */
/* supervisor as a handful of connected moments, not thirteen isolated */
/* forms. These six chapters merge the closely-related modules into a  */
/* single human narrative — arrival → power → community → proof →      */
/* reflection → verdict — while each chapter still submits on its own. */
/* ------------------------------------------------------------------ */
export interface SupervisoryChapter {
  /** Stable id used as __section_id on submission. */
  id: string;
  /** Display index label ("1".."6"). */
  code: string;
  title: string;
  /** One-line immersive framing shown under the title. */
  subtitle: string;
  /** Conversational opening shown at the top of the chapter while filling. */
  narrative: string;
  /** Conversational hand-off line nudging toward the next chapter. */
  closing: string;
  /** Raw module letter codes (A–M) merged into this chapter. */
  members: string[];
  /** Accent hue (aligned to SECTION_HUES ordering). */
  hue: string;
}

export const SUPERVISORY_CHAPTERS: SupervisoryChapter[] = [
  {
    id: "ch_arrival",
    code: "1",
    title: "Arrival & Intent",
    subtitle: "Who you met, where you stood, and what today was meant to achieve.",
    narrative:
      "Every supervision visit begins the moment you arrive. Before judging anything, ground the visit in reality — pin exactly where you are, who is beside you, and what this activity set out to do. A plan you can point to is the difference between a real visit and a guess.",
    closing:
      "Now that we know where we stand and what was promised, let's step into the rooms where the decisions were made.",
    members: ["A", "B"],
    hue: "#0F7B6C",
  },
  {
    id: "ch_rooms_of_power",
    code: "2",
    title: "The Rooms of Power",
    subtitle: "The advocacy that opened doors — from stakeholders to the LGA.",
    narrative:
      "Programmes move at the speed of the people who can say yes. Retrace the conversations with decision-makers and LGA actors: who was truly in the room, what they committed to, and whether those promises turned into support you can actually see on the ground.",
    closing:
      "With the powerful engaged, the real test is what happened when the message finally reached the community.",
    members: ["C", "D"],
    hue: "#3AA0B8",
  },
  {
    id: "ch_community_encounter",
    code: "3",
    title: "The Community Encounter",
    subtitle: "Dialogue, resistance, and how the word spread.",
    narrative:
      "This is where the programme meets people. Sit with the dialogue as it happened — who showed up, who spoke, who stayed silent. Follow every refusal to its real cause, and trace how awareness travelled through radio, announcements and materials.",
    closing:
      "The encounter is only as trustworthy as the evidence behind it — let's verify what we've been told.",
    members: ["E", "F", "G"],
    hue: "#7C4D8F",
  },
  {
    id: "ch_proof",
    code: "4",
    title: "Proof & Verification",
    subtitle: "The records, photos and numbers that back the story.",
    narrative:
      "Claims are easy; evidence is hard. Put the records side by side and cross-check the same figure in two places. Where the numbers agree, confidence grows; where they diverge, you've found the story that matters most.",
    closing:
      "With the facts settled, step back and reflect honestly on what worked and what didn't.",
    members: ["H"],
    hue: "#0B5CAB",
  },
  {
    id: "ch_reflection",
    code: "5",
    title: "Honest Reflection",
    subtitle: "Successes, challenges and the lessons worth keeping.",
    narrative:
      "The most valuable part of any visit is the truth told plainly. Name the win worth copying, the bottleneck that hurt, and the underlying cause behind it — then turn it into a lesson with a stop, start or continue that someone actually owns.",
    closing:
      "Reflection means nothing without commitment — let's turn these lessons into a plan and a verdict.",
    members: ["I", "J", "K"],
    hue: "#EF6C4D",
  },
  {
    id: "ch_verdict",
    code: "6",
    title: "Commitments & Verdict",
    subtitle: "Owned action points and your final, evidence-based judgement.",
    narrative:
      "Close the loop. Every finding should leave as a SMART action with an owner and a date, and your final scores should mirror the evidence you gathered — not the impression you formed. Sign off on the whole visit, honestly.",
    closing:
      "That completes the visit — a full, honest picture from arrival to verdict. Nice work.",
    members: ["L", "M"],
    hue: "#C0392B",
  },
];

/**
 * Extract the leading module letter (A–M) from a raw group label such as
 * "A. Supervisor & Visit Information" or "Section C — Stakeholder Advocacy".
 * Returns the upper-case letter, or null when no module code is present.
 */
export function chapterCodeFromLabel(label: string): string | null {
  if (!label) return null;
  const m = label.match(/(?:^|section\s+)([A-M])(?=[\s.)*:—–-]|$)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Find the chapter that owns a given raw module letter code. */
export function chapterForCode(code: string | null): SupervisoryChapter | null {
  if (!code) return null;
  return SUPERVISORY_CHAPTERS.find((c) => c.members.includes(code.toUpperCase())) || null;
}

/** Guidance objects belonging to a chapter, in module order. */
export function chapterGuidance(chapter: SupervisoryChapter): ModuleGuidance[] {
  return chapter.members
    .map((code) => MODULE_GUIDANCE.find((g) => g.code === code))
    .filter((g): g is ModuleGuidance => !!g);
}
