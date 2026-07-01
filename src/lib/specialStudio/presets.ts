// Special Form Studio — starter presets.
//
// Each preset seeds a ready-to-use special form (sections + fields + theme)
// AND pre-wires a linked monitoring dashboard (dashboardEnabled + KPI hints)
// so the Owner can start collecting and monitoring immediately.

import type { FormGroup, Question, QuestionType } from "@/components/FormBuilder/types";
import { DEFAULT_FORM_THEME, type FormTheme } from "@/lib/formTheme";

const uid = () => Math.random().toString(36).slice(2, 10);

function q(type: QuestionType, label: string, extra: Partial<Question> = {}): Question {
  return {
    id: uid(),
    type,
    label,
    name: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32)}_${uid().slice(0, 4)}`,
    required: false,
    ...extra,
  };
}

function opts(...labels: string[]) {
  return labels.map((l) => ({ id: uid(), label: l, value: l.toLowerCase().replace(/\s+/g, "_") }));
}

function section(label: string, questions: Question[]): FormGroup {
  return { id: uid(), name: `sec_${uid()}`, label, questions };
}

export interface DashboardConfig {
  enabled: true;
  /** Primary metric fields (question names) surfaced as KPI cards. */
  kpiFields: string[];
  /** Field used for status/completion breakdown, if any. */
  statusField?: string;
  /** Field used for geography/location grouping, if any. */
  geoField?: string;
  accent: string;
}

export interface StudioPreset {
  key: string;
  title: string;
  subtitle: string;
  accent: string;
  theme: FormTheme;
  sections: () => FormGroup[];
  dashboard: () => DashboardConfig;
}

function theme(primary: string, accent: string, headerBg: string): FormTheme {
  return {
    ...DEFAULT_FORM_THEME,
    enabled: true,
    cardStyle: "elevated",
    density: "comfortable",
    light: { ...DEFAULT_FORM_THEME.light, primary, accent, headerBg, headerText: "#ffffff" },
  };
}

export const STUDIO_PRESETS: StudioPreset[] = [
  {
    key: "blank",
    title: "Blank canvas",
    subtitle: "Start from scratch with one empty section",
    accent: "#6366f1",
    theme: theme("#6366f1", "#a855f7", "#4338ca"),
    sections: () => [section("Section 1", [])],
    dashboard: () => ({ enabled: true, kpiFields: [], accent: "#6366f1" }),
  },
  {
    key: "bloomberg",
    title: "Bloomberg School Enrolment Validation",
    subtitle: "School-level enrolment & validation checklist + dashboard",
    accent: "#0c2340",
    theme: theme("#0c2340", "#c8102e", "#0c2340"),
    sections: () => {
      const state = q("select_one", "State", { required: true, options: opts("Kano", "Jigawa", "Sokoto") });
      const enrolled = q("number", "Learners enrolled", { required: true });
      const validated = q("number", "Learners validated", { required: true });
      const status = q("select_one", "Validation status", {
        required: true,
        options: opts("Validated", "Partially validated", "Not validated"),
      });
      return [
        section("School identification", [
          state,
          q("text", "LGA", { required: true }),
          q("text", "School name", { required: true }),
          q("geopoint", "School GPS"),
        ]),
        section("Enrolment", [enrolled, validated]),
        section("Outcome", [status, q("image", "Evidence photo"), q("signature", "Validator signature")]),
      ];
    },
    dashboard: () => ({
      enabled: true,
      kpiFields: ["learners_enrolled", "learners_validated"],
      statusField: "validation_status",
      geoField: "state",
      accent: "#0c2340",
    }),
  },
  {
    key: "seeclear",
    title: "See Clear Eye Health",
    subtitle: "Vision screening capture + monitoring dashboard",
    accent: "#0f766e",
    theme: theme("#0f766e", "#14b8a6", "#0f766e"),
    sections: () => {
      const status = q("select_one", "Screening outcome", {
        required: true,
        options: opts("Normal", "Refractive error", "Referred", "Treated"),
      });
      return [
        section("Client", [
          q("text", "Client name", { required: true }),
          q("number", "Age", { required: true }),
          q("select_one", "Gender", { required: true, options: opts("Male", "Female") }),
        ]),
        section("Screening", [
          q("number", "Screened count", { required: true }),
          status,
          q("select_one", "Spectacles dispensed", { options: opts("Yes", "No") }),
        ]),
        section("Location", [q("text", "Facility"), q("geopoint", "GPS")]),
      ];
    },
    dashboard: () => ({
      enabled: true,
      kpiFields: ["screened_count"],
      statusField: "screening_outcome",
      geoField: "facility",
      accent: "#0f766e",
    }),
  },
  {
    key: "mda",
    title: "Integrated MDA Supervisory Checklist",
    subtitle: "Community MDA supervision checklist + dashboard",
    accent: "#0d9488",
    theme: theme("#0d9488", "#10b981", "#134e4a"),
    sections: () => {
      const status = q("select_one", "Status of MDA", {
        required: true,
        options: opts("Completed", "Ongoing", "Not started"),
      });
      return [
        section("Location", [
          q("select_one", "State", { required: true, options: opts("Kano", "Jigawa", "Sokoto") }),
          q("text", "LGA", { required: true }),
          q("text", "Ward"),
          q("text", "Community", { required: true }),
          q("geopoint", "GPS"),
        ]),
        section("Supervision", [
          status,
          q("number", "Population treated", { required: true }),
          q("number", "Population targeted", { required: true }),
          q("select_one", "Adverse reactions reported", { options: opts("Yes", "No") }),
        ]),
        section("Verification", [q("image", "Photo evidence"), q("signature", "Supervisor signature")]),
      ];
    },
    dashboard: () => ({
      enabled: true,
      kpiFields: ["population_treated", "population_targeted"],
      statusField: "status_of_mda",
      geoField: "state",
      accent: "#0d9488",
    }),
  },
  {
    key: "sarmaan",
    title: "SARMAAN ACSM Indicator Reporting",
    subtitle: "Advocacy & communication indicator form + dashboard",
    accent: "#0891b2",
    theme: theme("#0891b2", "#22d3ee", "#155e75"),
    sections: () => {
      const level = q("select_one", "Reporting level", {
        required: true,
        options: opts("Low", "Medium", "High"),
      });
      return [
        section("Report identification", [
          q("select_one", "LGA", { required: true, options: opts("Ungogo", "Nasarawa", "Fagge") }),
          q("select_one", "Activity type", {
            required: true,
            options: opts("Advocacy Supervision", "Town Announcers", "Compound Meeting", "Community Dialogue"),
          }),
          q("date", "Reporting month"),
        ]),
        section("Indicators", [
          q("number", "Stakeholders engaged", { required: true }),
          q("number", "People reached", { required: true }),
          level,
        ]),
        section("Evidence", [q("image", "Activity photo (with consent)"), q("geopoint", "GPS")]),
      ];
    },
    dashboard: () => ({
      enabled: true,
      kpiFields: ["stakeholders_engaged", "people_reached"],
      statusField: "reporting_level",
      geoField: "lga",
      accent: "#0891b2",
    }),
  },
];

export function getPreset(key: string): StudioPreset | undefined {
  return STUDIO_PRESETS.find((p) => p.key === key);
}
