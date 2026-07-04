// SARMAAN ACSM & MDA Supervision Checklist — definition.
//
// Faithful field-level model of the printed "SARMAAN ACSM & MDA SUPERVISION
// CHECKLIST" (Mass Drug Administration of Azithromycin to children 1–59 months
// by CDDs). Drives the SarmaanAcsmChecklist wizard, the persisted `forms` row
// schema, and the analytics mapping.
//
// The 8 wizard steps mirror the printed booklet:
//   1. Location & Teams          (A)
//   2. IEC Materials & Visibility(B)
//   3. Town Announcers & Mobilization (C)
//   4. Community Awareness Validation (D)
//   5. Drug Management & Administration (E)
//   6. Eligibility & Safety / Adverse Events (F)
//   7. Documentation & House Marking (G)
//   8. Summary & Corrective Actions (H)

export const SARMAAN_ACSM_FORM_NAME = "SARMAAN ACSM & MDA Supervision Checklist";
export const SARMAAN_ACSM_DESC =
  "Mass Drug Administration by CDDs — Azithromycin for children 1–59 months. ACSM supervision with team deployment, IEC visibility, mobilization, community awareness validation, drug administration, safety and corrective actions.";

export type YNPValue = "yes" | "no" | "partly" | "na";

export interface CheckItem {
  name: string;
  label: string;
  /** icon key (lucide name) rendered beside the row */
  icon?: string;
}

export interface AwarenessColumn {
  name: string;
  label: string;
  sub?: string;
  kind: "yn" | "select";
  options?: string[];
}

/** Section B — IEC materials & visibility (Yes / No / Partly / N/A matrix). */
export const IEC_ITEMS: CheckItem[] = [
  { name: "iec_ward_apex", label: "IEC materials available at Ward Apex Facility", icon: "Landmark" },
  { name: "iec_banner_apex", label: "Banner displayed at Ward Apex Facility", icon: "Flag" },
  { name: "iec_community", label: "IEC materials available in the community", icon: "Home" },
  { name: "iec_head_house", label: "IEC materials available/displayed at community head's house", icon: "Building2" },
  { name: "iec_job_aids", label: "CDDs carrying job aids or key message guides", icon: "ClipboardList" },
  { name: "iec_messages_clear", label: "IEC messages clear on target age, free medicine, benefits & side effects", icon: "MessageSquare" },
];

/** Section C — town announcers & mobilization (Yes / No). */
export const MOBILIZATION_ITEMS: CheckItem[] = [
  { name: "announcers_selected", label: "Town announcers selected within the ward?" },
  { name: "announcers_present", label: "Town announcers present in communities visited?" },
  { name: "announcements_made", label: "Announcements made before or during MDA?" },
  { name: "announcers_have_id", label: "Town announcers have means of identification?" },
];

export const ANNOUNCEMENT_CONTENT_ITEMS: CheckItem[] = [
  { name: "content_target_age", label: "Mentions correct target age (1–59 months)" },
  { name: "content_free", label: "Says medicine is FREE" },
  { name: "content_when_visit", label: "Tells caregivers when CDDs will visit" },
];

export const ID_TYPES = ["Cap", "T-shirt", "ID Card", "Apron", "Other", "None"];

/** Section C — what caregivers think the medicine prevents (multi-select). */
export const MEDICINE_PREVENTS_OPTIONS = [
  "Acute respiratory tract infection",
  "Diarrheal diseases",
  "Skin and soft tissue infections",
  "Middle ear infections",
  "Others",
];

/** Section D — community awareness validation (sample of 5 caregivers). */
export const AWARENESS_COLUMNS: AwarenessColumn[] = [
  { name: "heard", label: "Heard About Campaign?", sub: "Yes / No", kind: "yn" },
  { name: "how_heard", label: "How Did You Hear?", sub: "(Select one)", kind: "select", options: ["Town announcer", "CDD/Health worker", "Community leader", "Religious leader", "Radio", "Family/Neighbour", "Other"] },
  { name: "knows_age", label: "Knows Eligible Age", sub: "(1–59 months)", kind: "yn" },
  { name: "knows_free", label: "Knows Medicine is Free?", sub: "Yes / No", kind: "yn" },
];

export const AWARENESS_SAMPLE_SIZE = 5;

/** Awareness performance targets shown as footer chips (image parity). */
export const AWARENESS_TARGETS = {
  awareness: 80,
  ageKnowledge: 80,
  freeMedicine: 90,
};

/** Section E — drug management & administration (Yes / No / N/A). */
export const DRUG_ITEMS: CheckItem[] = [
  { name: "correct_reconstitution", label: "Azithromycin correctly reconstituted (15ml clean water)?" },
  { name: "dose_by_age_1_11", label: "Correct dose given by age for 1–11 months (2/3/4ml)?" },
  { name: "dose_pole_used", label: "Colour-coded dose pole used for 12–59 months?" },
  { name: "expiry_checked", label: "Expiry date checked before administration?" },
  { name: "directly_observed", label: "Directly Observed Treatment (child swallows) practised?" },
  { name: "revomit_redose", label: "Re-dose given once if child vomits within 5–10 mins?" },
  { name: "clean_water_used", label: "Clean drinking water used for reconstitution?" },
];

/** Section F — eligibility & safety. */
export const ELIGIBILITY_ITEMS: CheckItem[] = [
  { name: "age_verified", label: "Child's age verified (records/caregiver/register)?" },
  { name: "excluded_under1_over5", label: "Children <1 month & >5 years correctly excluded?" },
  { name: "excluded_severely_ill", label: "Severely ill/weak children correctly excluded?" },
  { name: "excluded_allergy", label: "Children with macrolide/antibiotic allergy excluded?" },
  { name: "consent_sought", label: "Consent sought from caregiver before administration?" },
];

/** Section G — documentation & house marking. */
export const DOCUMENTATION_ITEMS: CheckItem[] = [
  { name: "register_or_app_used", label: "Treatment register or digital app used for recording?" },
  { name: "records_complete", label: "Records complete (name, sex, age, dose)?" },
  { name: "house_marking_done", label: "House marking done with chalk after administration?" },
  { name: "tally_matches", label: "Tally / summary matches the register?" },
];

/** Field names used across the analytics layer & exports. */
export const ACSM_FIELD = {
  state: "state",
  lga: "lga",
  ward: "ward",
  community: "community",
  wardApexFacility: "ward_apex_facility",
  supervisionDate: "supervision_date",
  teamSupervised: "team_supervised",
  teamsPlanned: "teams_planned",
  teamsWentOut: "teams_went_out",
  teamsNotOut: "teams_not_out",
  deploymentRate: "teams_deployment_rate",
  teamReason: "teams_not_out_reason",
  idType: "announcer_id_type",
  medicinePrevents: "announcement_prevents",
  awarenessRate: "awareness_rate",
  ageKnowledge: "age_knowledge_rate",
  freeMedicineKnowledge: "free_medicine_knowledge_rate",
  aesObserved: "adverse_events_observed",
  aesReferred: "adverse_events_referred",
  issues: "issues_identified",
  corrective: "corrective_actions",
  responsible: "responsible_person",
  deadline: "action_deadline",
  supervisorName: "supervisor_name",
  attestation: "attestation",
} as const;

/** Stable list of the 8 step ids/labels used for progress + per-section access. */
export const ACSM_SECTIONS = [
  { id: "acsm_location_teams", label: "A. Location & Teams" },
  { id: "acsm_iec", label: "B. IEC Materials & Visibility" },
  { id: "acsm_mobilization", label: "C. Town Announcers & Mobilization" },
  { id: "acsm_awareness", label: "D. Community Awareness Validation" },
  { id: "acsm_drug", label: "E. Drug Management & Administration" },
  { id: "acsm_safety", label: "F. Eligibility & Safety" },
  { id: "acsm_documentation", label: "G. Documentation & House Marking" },
  { id: "acsm_summary", label: "H. Summary & Corrective Actions" },
];

/** Build the persisted `forms.questions` (FormGroup[]) schema so submissions,
 *  the Admin Submission Editor and exports can resolve every field by name. */
export function buildAcsmFormSchema() {
  const uid = () => Math.random().toString(36).slice(2, 10);
  const opt = (l: string) => ({ id: uid(), label: l, value: l.toLowerCase().replace(/[^a-z0-9]+/g, "_") });
  const ynp = () => [opt("Yes"), opt("No"), opt("Partly"), opt("N/A")];
  const yn = () => [opt("Yes"), opt("No")];
  const q = (type: string, name: string, label: string, extra: Record<string, any> = {}) =>
    ({ id: uid(), type, name, label, required: false, ...extra });

  const groups = [
    {
      id: uid(), name: "acsm_location_teams", label: "A. Location & Teams",
      questions: [
        q("select_one", ACSM_FIELD.state, "State", { required: true }),
        q("select_one", ACSM_FIELD.lga, "LGA", { required: true }),
        q("select_one", ACSM_FIELD.ward, "Ward"),
        q("text", ACSM_FIELD.community, "Community"),
        q("text", ACSM_FIELD.wardApexFacility, "Ward Apex Facility"),
        q("date", ACSM_FIELD.supervisionDate, "Date", { required: true }),
        q("text", ACSM_FIELD.teamSupervised, "Team(s) Supervised"),
        q("number", ACSM_FIELD.teamsPlanned, "Teams Planned", { required: true }),
        q("number", ACSM_FIELD.teamsWentOut, "Teams That Went Out", { required: true }),
        q("number", ACSM_FIELD.teamsNotOut, "Teams Not Out"),
        q("number", ACSM_FIELD.deploymentRate, "Teams Deployment Rate (%)"),
        q("text", ACSM_FIELD.teamReason, "Reason any team did not go out"),
      ],
    },
    { id: uid(), name: "acsm_iec", label: "B. IEC Materials & Visibility",
      questions: IEC_ITEMS.map((i) => q("select_one", i.name, i.label, { options: ynp() })) },
    { id: uid(), name: "acsm_mobilization", label: "C. Town Announcers & Mobilization",
      questions: [
        ...MOBILIZATION_ITEMS.map((i) => q("select_one", i.name, i.label, { options: yn() })),
        q("select_one", ACSM_FIELD.idType, "Type of identification", { options: ID_TYPES.map(opt) }),
        ...ANNOUNCEMENT_CONTENT_ITEMS.map((i) => q("select_one", i.name, i.label, { options: yn() })),
      ] },
    { id: uid(), name: "acsm_awareness", label: "D. Community Awareness Validation",
      questions: [
        ...Array.from({ length: AWARENESS_SAMPLE_SIZE }).flatMap((_, r) =>
          AWARENESS_COLUMNS.map((c) => q(c.kind === "select" ? "select_one" : "select_one", `aw_${r + 1}_${c.name}`, `#${r + 1} ${c.label}`))),
        q("number", ACSM_FIELD.awarenessRate, "Awareness Rate (%)"),
        q("number", ACSM_FIELD.ageKnowledge, "Correct Age Knowledge (%)"),
        q("number", ACSM_FIELD.freeMedicineKnowledge, "Free Medicine Knowledge (%)"),
      ] },
    { id: uid(), name: "acsm_drug", label: "E. Drug Management & Administration",
      questions: DRUG_ITEMS.map((i) => q("select_one", i.name, i.label, { options: [opt("Yes"), opt("No"), opt("N/A")] })) },
    { id: uid(), name: "acsm_safety", label: "F. Eligibility & Safety",
      questions: [
        ...ELIGIBILITY_ITEMS.map((i) => q("select_one", i.name, i.label, { options: [opt("Yes"), opt("No"), opt("N/A")] })),
        q("number", ACSM_FIELD.aesObserved, "Adverse events observed"),
        q("number", ACSM_FIELD.aesReferred, "Adverse events referred to facility"),
      ] },
    { id: uid(), name: "acsm_documentation", label: "G. Documentation & House Marking",
      questions: DOCUMENTATION_ITEMS.map((i) => q("select_one", i.name, i.label, { options: ynp() })) },
    { id: uid(), name: "acsm_summary", label: "H. Summary & Corrective Actions",
      questions: [
        q("text", ACSM_FIELD.issues, "Issues identified", { appearance: "multiline" }),
        q("text", ACSM_FIELD.corrective, "Corrective actions agreed", { appearance: "multiline" }),
        q("text", ACSM_FIELD.responsible, "Responsible person"),
        q("date", ACSM_FIELD.deadline, "Action deadline"),
        q("text", ACSM_FIELD.supervisorName, "Supervisor name", { required: true }),
        q("acknowledge", ACSM_FIELD.attestation, "I confirm these observations are accurate and were made during this supervisory visit.", { required: true }),
      ] },
  ];

  return groups;
}
