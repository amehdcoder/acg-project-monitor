// Bloomberg School Eye Health Project — School Enrolment Validation.
// Code-defined "standard form" so it lives permanently in the Standard Forms
// folder, independent of whether the Bloomberg project still exists.

export const BLOOMBERG_FORM_ID = "bloomberg_enrolment";
export const BLOOMBERG_FORM_NAME = "Bloomberg School Enrolment Validation";
export const BLOOMBERG_FORM_DESC =
  "School-based Eye Health Intervention — independent validation of LEA school enrolment.";

export interface ClassDef {
  key: string;
  label: string;
  section: "primary" | "jss";
}

export const PRIMARY_CLASSES: ClassDef[] = [
  { key: "p1", label: "P1", section: "primary" },
  { key: "p2", label: "P2", section: "primary" },
  { key: "p3", label: "P3", section: "primary" },
  { key: "p4", label: "P4", section: "primary" },
  { key: "p5", label: "P5", section: "primary" },
  { key: "p6", label: "P6", section: "primary" },
];

export const JSS_CLASSES: ClassDef[] = [
  { key: "jss1", label: "JSS 1", section: "jss" },
  { key: "jss2", label: "JSS 2", section: "jss" },
  { key: "jss3", label: "JSS 3", section: "jss" },
];

export const ALL_CLASSES: ClassDef[] = [...PRIMARY_CLASSES, ...JSS_CLASSES];

// Cascade fields the Owner can scope a user to (global feature).
export type CascadeFieldKey = "state" | "lga" | "ward" | "location" | "school_key";

export const CASCADE_FIELDS: { key: CascadeFieldKey; label: string }[] = [
  { key: "state", label: "State" },
  { key: "lga", label: "LGA" },
  { key: "ward", label: "Ward" },
  { key: "location", label: "Community / Location" },
  { key: "school_key", label: "School" },
];

export interface BloombergSchool {
  school_key: string;
  label: string | null;
  school_name: string;
  school_code: string | null;
  school_type: string | null;
  school_level: string | null;
  ownership: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  location: string | null;
  state_label: string | null;
  lga_label: string | null;
  ward_label: string | null;
  location_label: string | null;
}

export type EnrolmentCounts = Record<string, { male: number | null; female: number | null }>;

export const emptyEnrolment = (): EnrolmentCounts => {
  const out: EnrolmentCounts = {};
  ALL_CLASSES.forEach((c) => (out[c.key] = { male: null, female: null }));
  return out;
};

export const classTotal = (e: EnrolmentCounts, key: string) =>
  (e[key]?.male ?? 0) + (e[key]?.female ?? 0);

export const sectionTotals = (e: EnrolmentCounts, classes: ClassDef[]) => {
  let male = 0,
    female = 0;
  classes.forEach((c) => {
    male += e[c.key]?.male ?? 0;
    female += e[c.key]?.female ?? 0;
  });
  return { male, female, total: male + female };
};

export const grandTotals = (e: EnrolmentCounts) => sectionTotals(e, ALL_CLASSES);

export const OPERATIONAL_STATUS = [
  { value: "operational", label: "Operational" },
  { value: "partially", label: "Partially operational" },
  { value: "closed", label: "Closed / Not operational" },
  { value: "merged", label: "Merged with another school" },
];

export const NOT_FOUND_REASONS = [
  { value: "wrong_location", label: "Wrong location / does not exist" },
  { value: "renamed", label: "School renamed" },
  { value: "closed_down", label: "School closed down" },
  { value: "inaccessible", label: "Location inaccessible" },
  { value: "other", label: "Other" },
];
