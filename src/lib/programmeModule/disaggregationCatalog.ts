// Standard disaggregation option catalogues for the Programme Report.
// Aligned with NTD programme reporting and global public-health practice
// (WHO / Nigeria FMoH conventions). Values are stored per dimension as JSON
// maps of option -> count inside the report entry's disaggregation object.

export type DisaggKind = "options" | "location";

export interface DisaggDimension {
  /** Normalised key used for storage and matching. */
  key: string;
  /** Label shown in the form. */
  label: string;
  kind: DisaggKind;
  /** For kind "location": deepest level this dimension captures. */
  level?: "state" | "lga" | "ward";
  /** Option groups for kind "options". */
  groups?: { title: string; options: string[] }[];
  /** Allow a free-text "Other" option. */
  allowOther?: boolean;
  hint?: string;
}

export const SEX_OPTIONS = ["Male", "Female"];

/** NTD programme age bands (MDA / morbidity reporting). */
export const NTD_AGE_BANDS = ["0–4 years", "5–14 years", "15+ years"];

/** Standard public-health age disaggregation (WHO / Nigeria HMIS). */
export const STANDARD_AGE_BANDS = [
  "0–11 months", "1–4 years", "5–9 years", "10–14 years", "15–19 years",
  "20–29 years", "30–44 years", "45–59 years", "60+ years",
];

export const DISEASE_CONDITIONS = [
  "Lymphoedema", "Hydrocoele", "Buruli ulcer", "Other skin NTDs",
  "Depression", "Psychosis", "Epilepsy", "Suicide / self-harm",
  "Child & adolescent mental / behavioural disorders", "Dementia",
  "Alcohol / substance use disorders", "Other significant emotional or medically unexplained complaints",
];

export const DISABILITY_TYPES = [
  "Visual / Seeing", "Hearing", "Physical / Mobility", "Intellectual / Cognitive",
  "Communication / Speech", "Self-care", "Albinism", "Mental / Psychosocial",
  "Multiple disabilities", "Other (outside project scope)",
];

export const STAKEHOLDER_TYPES = [
  "Community Directed Distributors (CDDs)", "Frontline Health Facility (FLHF) staff",
  "Community leaders", "Ward Development Committee", "Caregivers / family members",
  "Persons with disabilities / OPDs", "Teachers / school staff", "Traditional / religious leaders",
  "LGA NTD team", "State Ministry of Health", "Partner organisation staff", "Other stakeholder",
];

const is = (label: string, ...words: string[]) => {
  const l = label.toLowerCase();
  return words.some((w) => l.includes(w));
};

/** Resolve a logframe disaggregation label (e.g. "Gender", "Age band") to a dimension. */
export function dimensionFor(label: string): DisaggDimension {
  if (is(label, "state", "lga", "ward", "community", "location")) {
    const l = label.toLowerCase();
    const level: "state" | "lga" | "ward" = l.includes("ward") || l.includes("community") ? "ward" : l.includes("lga") ? "lga" : "state";
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    return {
      key: `location_${slug}`, label, kind: "location", level,
      hint: level === "state" ? "Pick the State and enter the value for it."
        : level === "lga" ? "Pick the State, then the LGA, and enter the value for that LGA."
        : "Pick the State, then LGA, then Ward, and enter the value for that area.",
    };
  }
  if (is(label, "gender", "sex")) {
    return { key: "sex", label: "Sex", kind: "options", groups: [{ title: "Sex", options: SEX_OPTIONS }] };
  }
  if (is(label, "age")) {
    return {
      key: "age", label: "Age band", kind: "options",
      groups: [
        { title: "NTD age bands", options: NTD_AGE_BANDS },
        { title: "Standard public-health bands", options: STANDARD_AGE_BANDS },
      ],
      hint: "Use the NTD bands for MDA / morbidity indicators; the standard bands for general health indicators.",
    };
  }
  if (is(label, "disease", "condition")) {
    return { key: "condition", label: "Disease condition", kind: "options", allowOther: true, groups: [{ title: "Conditions", options: DISEASE_CONDITIONS }] };
  }
  if (is(label, "impairment", "disability")) {
    return { key: "disability", label: "Impairment / Disability type", kind: "options", allowOther: true, groups: [{ title: "Types", options: DISABILITY_TYPES }] };
  }
  if (is(label, "stakeholder")) {
    return { key: "stakeholder", label: "Stakeholder type", kind: "options", allowOther: true, groups: [{ title: "Stakeholders", options: STAKEHOLDER_TYPES }] };
  }
  // Fallback: free-text entry for unmodelled dimensions (Cadre, Services, facility level…).
  return { key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label, kind: "options", allowOther: true, groups: [] };
}

/** Parse a stored disaggregation cell (JSON map or legacy free text). */
export function parseDisaggCell(raw: string | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const out: Record<string, number> = {};
      for (const [k, n] of Object.entries(v)) {
        const num = typeof n === "number" ? n : Number(n);
        if (Number.isFinite(num) && num !== 0) out[k] = num;
      }
      return out;
    }
  } catch { /* legacy free text */ }
  return {};
}

export const serializeDisaggCell = (map: Record<string, number>): string =>
  Object.keys(map).length ? JSON.stringify(map) : "";

/** Short human summary of a stored cell, e.g. "M 12 · F 9". */
export function summarizeDisaggCell(raw: string | undefined, max = 3): string {
  const entries = Object.entries(parseDisaggCell(raw));
  if (!entries.length) return "";
  const shown = entries.slice(0, max).map(([k, v]) => `${k}: ${v}`);
  return shown.join(" · ") + (entries.length > max ? ` +${entries.length - max} more` : "");
}
