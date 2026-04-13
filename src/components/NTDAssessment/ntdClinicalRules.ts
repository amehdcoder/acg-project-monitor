// ═══════════════════════════════════════════════════════════
// NTD Clinical Rules Engine
// Rule-based decision support for non-clinical field workers
// Based on WHO/NTD Programme guidelines
// ═══════════════════════════════════════════════════════════

export interface ScreeningQuestion {
  id: string;
  text: string;            // Plain language question
  helpText?: string;       // "Why this question?" explanation
  type: "yes_no" | "single" | "multi" | "number" | "body_location";
  options?: { value: string; label: string; icon?: string }[];
  required: boolean;
  /** Only show this question if condition is met */
  showIf?: (answers: Record<string, any>) => boolean;
  /** Visual aid key for side-by-side comparison */
  visualAidKey?: string;
  /** Red flag — if this answer triggers urgent referral */
  redFlagValues?: string[];
  redFlagMessage?: string;
}

export interface SeverityStage {
  id: string;
  label: string;
  description: string;
  visualDescription: string;  // What the field worker should look for
  color: string;              // Semantic color key
}

export interface DecisionRule {
  id: string;
  description: string;
  condition: (answers: Record<string, any>) => boolean;
  result: "likely" | "possible" | "unlikely" | "red_flag";
  message: string;
}

export interface ConsistencyCheck {
  id: string;
  description: string;
  check: (answers: Record<string, any>) => boolean;
  errorMessage: string;
  fieldIds: string[];
}

export interface ReferralAction {
  urgency: "routine" | "priority" | "urgent" | "emergency";
  action: string;
  reason: string;
  icon: string;
  color: string;
}

export interface NTDProtocol {
  id: string;
  name: string;
  shortName: string;
  description: string;
  emoji: string;
  color: string;
  /** Initial screening questions to determine if this NTD should be assessed */
  screeningQuestions: ScreeningQuestion[];
  /** Detailed assessment questions (shown after screening) */
  assessmentQuestions: ScreeningQuestion[];
  /** Severity staging */
  stages: SeverityStage[];
  /** Decision rules for classification */
  decisionRules: DecisionRule[];
  /** Cross-field consistency checks */
  consistencyChecks: ConsistencyCheck[];
  /** Determine referral based on answers */
  getReferral: (answers: Record<string, any>, stage?: string) => ReferralAction;
  /** Calculate confidence score (0-100) */
  getConfidence: (answers: Record<string, any>) => number;
}

// ═══════════════════════════════════════════════════════════
// LYMPHOEDEMA PROTOCOL
// ═══════════════════════════════════════════════════════════

const lymphoedemaProtocol: NTDProtocol = {
  id: "lymphoedema",
  name: "Lymphoedema",
  shortName: "LF-Lymph",
  description: "Chronic swelling of limbs caused by lymphatic filariasis",
  emoji: "🦵",
  color: "hsl(var(--primary))",
  screeningQuestions: [
    {
      id: "has_swelling", text: "Does the person have swelling of any limb (leg, arm)?",
      helpText: "Look for visible enlargement compared to the other limb. Ask the person if the swelling has been present for more than a few days.",
      type: "yes_no", required: true,
      visualAidKey: "lymphoedema_swelling_compare",
    },
    {
      id: "swelling_location", text: "Which limb(s) are swollen?",
      type: "multi", required: true,
      options: [
        { value: "left_leg", label: "Left Leg", icon: "🦵" },
        { value: "right_leg", label: "Right Leg", icon: "🦵" },
        { value: "left_arm", label: "Left Arm", icon: "💪" },
        { value: "right_arm", label: "Right Arm", icon: "💪" },
        { value: "genitals", label: "Genital Area", icon: "⚠️" },
      ],
      showIf: (a) => a.has_swelling === "yes",
    },
    {
      id: "swelling_duration", text: "How long has the swelling been present?",
      type: "single", required: true,
      options: [
        { value: "less_1_week", label: "Less than 1 week" },
        { value: "1_4_weeks", label: "1-4 weeks" },
        { value: "1_3_months", label: "1-3 months" },
        { value: "3_12_months", label: "3-12 months" },
        { value: "over_1_year", label: "More than 1 year" },
      ],
      showIf: (a) => a.has_swelling === "yes",
      helpText: "Lymphoedema typically develops slowly over months to years. Short duration may indicate another cause.",
    },
  ],
  assessmentQuestions: [
    {
      id: "pitting", text: "Press the swollen area firmly with your thumb for 5 seconds, then release. Does a dent (pit) remain?",
      type: "yes_no", required: true,
      helpText: "Pitting edema means the tissue holds the impression. This helps determine the stage. In early stages, the swelling pits easily. In later stages, the tissue becomes hard and does not pit.",
      visualAidKey: "lymphoedema_pitting_test",
    },
    {
      id: "skin_changes", text: "What skin changes can you see on the swollen limb?",
      type: "multi", required: true,
      options: [
        { value: "normal_skin", label: "Skin looks normal (just swollen)" },
        { value: "thickened", label: "Skin feels thicker than normal" },
        { value: "shallow_folds", label: "Shallow skin folds visible" },
        { value: "deep_folds", label: "Deep skin folds/creases" },
        { value: "knobs", label: "Knob-like bumps on skin" },
        { value: "mossy", label: "Mossy/warty growths" },
      ],
      helpText: "Skin changes help determine the stage of lymphoedema. Look carefully at the affected limb compared to the normal one.",
    },
    {
      id: "swelling_reduces_overnight", text: "Does the swelling go down (reduce) when the person lies down or sleeps?",
      type: "yes_no", required: true,
      helpText: "Early-stage lymphoedema reduces with elevation. If swelling persists even after overnight rest, the condition is more advanced.",
    },
    {
      id: "acute_attacks", text: "Does the person get episodes of fever with hot, red, painful swelling? (Acute attacks / ADL)",
      type: "single", required: true,
      options: [
        { value: "never", label: "Never" },
        { value: "rarely", label: "Rarely (1-2 times per year)" },
        { value: "sometimes", label: "Sometimes (3-6 times per year)" },
        { value: "frequently", label: "Frequently (more than 6 per year)" },
      ],
      redFlagValues: ["frequently"],
      redFlagMessage: "Frequent acute attacks require immediate morbidity management and possible antibiotic prophylaxis.",
    },
    {
      id: "hygiene_practice", text: "Does the person currently wash and care for the swollen limb daily?",
      type: "yes_no", required: true,
      helpText: "Limb hygiene is the cornerstone of lymphoedema management. This helps assess current self-care status.",
    },
    {
      id: "functional_impact", text: "How much does the swelling affect daily activities?",
      type: "single", required: true,
      options: [
        { value: "none", label: "No impact — can do everything normally" },
        { value: "mild", label: "Some difficulty — slower but manages" },
        { value: "moderate", label: "Needs help with some tasks" },
        { value: "severe", label: "Cannot perform daily activities" },
      ],
    },
    {
      id: "odor_wounds", text: "Are there wounds, bad odor, or oozing from the affected area?",
      type: "yes_no", required: true,
      redFlagValues: ["yes"],
      redFlagMessage: "Open wounds or infection signs require immediate clinical attention to prevent worsening.",
    },
  ],
  stages: [
    { id: "stage_1", label: "Stage 1", description: "Reversible swelling", visualDescription: "Swelling that goes down with elevation overnight. Skin still looks normal, pits when pressed.", color: "text-blue-600" },
    { id: "stage_2", label: "Stage 2", description: "Irreversible, no skin folds", visualDescription: "Swelling does NOT go down with rest. Skin may be slightly thicker, but no deep folds.", color: "text-amber-600" },
    { id: "stage_3", label: "Stage 3", description: "Shallow skin folds", visualDescription: "Visible shallow folds or creases on the skin. Limb is clearly enlarged.", color: "text-amber-700" },
    { id: "stage_4", label: "Stage 4", description: "Knobs on skin", visualDescription: "Bumpy, knob-like growths on the skin surface. Deep creases between knobs.", color: "text-orange-600" },
    { id: "stage_5", label: "Stage 5", description: "Deep skin folds", visualDescription: "Very deep folds in the skin. Limb is very large and heavy.", color: "text-red-500" },
    { id: "stage_6", label: "Stage 6", description: "Mossy lesions", visualDescription: "Warty, mossy-looking growths covering parts of the limb. Often has bad smell.", color: "text-red-600" },
    { id: "stage_7", label: "Stage 7", description: "Unable to perform daily activities", visualDescription: "Person cannot walk, work, or care for themselves due to the affected limb.", color: "text-red-700" },
  ],
  decisionRules: [
    { id: "lr1", description: "Classic chronic lymphoedema", condition: (a) => a.has_swelling === "yes" && ["3_12_months", "over_1_year"].includes(a.swelling_duration) && a.skin_changes?.some((v: string) => v !== "normal_skin"), result: "likely", message: "Pattern strongly suggests chronic lymphoedema. Duration and skin changes are consistent." },
    { id: "lr2", description: "Early/reversible lymphoedema", condition: (a) => a.has_swelling === "yes" && a.swelling_reduces_overnight === "yes" && a.pitting === "yes", result: "possible", message: "Swelling that reduces with elevation may be early-stage lymphoedema. Monitor and initiate hygiene education." },
    { id: "lr3", description: "Acute attack risk", condition: (a) => a.acute_attacks === "frequently" || a.odor_wounds === "yes", result: "red_flag", message: "⚠️ Immediate clinical attention needed. Frequent acute attacks or wound infection present." },
    { id: "lr4", description: "Short duration — other cause possible", condition: (a) => a.has_swelling === "yes" && ["less_1_week", "1_4_weeks"].includes(a.swelling_duration), result: "unlikely", message: "Very recent swelling is unlikely to be lymphoedema. Consider other causes (injury, infection, DVT)." },
  ],
  consistencyChecks: [
    { id: "lc1", description: "Swelling without location", check: (a) => a.has_swelling === "yes" && (!a.swelling_location || a.swelling_location.length === 0), errorMessage: "You indicated swelling is present but did not select which limb(s). Please select the affected limb(s).", fieldIds: ["swelling_location"] },
    { id: "lc2", description: "Mossy but early stage", check: (a) => a.skin_changes?.includes("mossy") && a.swelling_reduces_overnight === "yes", errorMessage: "You indicated mossy/warty growths but also said swelling reduces overnight. Mossy growths typically occur in advanced stages where swelling is permanent. Please re-check.", fieldIds: ["skin_changes", "swelling_reduces_overnight"] },
  ],
  getReferral: (a, stage) => {
    if (a.odor_wounds === "yes" || a.acute_attacks === "frequently") {
      return { urgency: "urgent", action: "Refer to health facility for wound care and possible antibiotics", reason: "Active infection or frequent acute attacks detected", icon: "🚨", color: "text-destructive" };
    }
    if (stage && ["stage_5", "stage_6", "stage_7"].includes(stage)) {
      return { urgency: "priority", action: "Refer for clinical assessment and morbidity management plan", reason: "Advanced stage requiring specialized care", icon: "⚠️", color: "text-amber-600" };
    }
    if (a.functional_impact === "severe") {
      return { urgency: "priority", action: "Refer for functional rehabilitation and social support", reason: "Severe functional disability", icon: "⚠️", color: "text-amber-600" };
    }
    return { urgency: "routine", action: "Provide hygiene education and self-care kit. Schedule follow-up in 3 months.", reason: "Manageable with community-based care", icon: "✅", color: "text-emerald-600" };
  },
  getConfidence: (a) => {
    let score = 0;
    const answered = Object.keys(a).filter(k => a[k] !== undefined && a[k] !== null && a[k] !== "");
    score += Math.min(answered.length * 8, 40); // Up to 40% for completeness
    if (a.has_swelling === "yes") score += 15;
    if (["3_12_months", "over_1_year"].includes(a.swelling_duration)) score += 15;
    if (a.skin_changes?.some((v: string) => v !== "normal_skin")) score += 15;
    if (a.pitting !== undefined) score += 5;
    if (a.acute_attacks !== undefined) score += 5;
    if (a.hygiene_practice !== undefined) score += 5;
    return Math.min(score, 100);
  },
};

// ═══════════════════════════════════════════════════════════
// HYDROCOELE PROTOCOL
// ═══════════════════════════════════════════════════════════

const hydrocoeleProtocol: NTDProtocol = {
  id: "hydrocoele",
  name: "Hydrocoele",
  shortName: "LF-Hydro",
  description: "Fluid accumulation in the scrotal sac, often caused by lymphatic filariasis",
  emoji: "🩺",
  color: "hsl(210, 70%, 50%)",
  screeningQuestions: [
    { id: "has_scrotal_swelling", text: "Does the person have swelling of the scrotum?", type: "yes_no", required: true, helpText: "Ask the person directly and observe if comfortable. Hydrocoele presents as a painless, gradual enlargement of the scrotum." },
    { id: "swelling_onset", text: "When did the scrotal swelling first appear?", type: "single", required: true, showIf: (a) => a.has_scrotal_swelling === "yes",
      options: [
        { value: "sudden", label: "Sudden (within days)" },
        { value: "gradual_weeks", label: "Gradually over weeks" },
        { value: "gradual_months", label: "Gradually over months" },
        { value: "gradual_years", label: "Gradually over years" },
      ],
      helpText: "Hydrocoele develops gradually. Sudden onset may indicate hernia, infection, or torsion requiring emergency referral.",
      redFlagValues: ["sudden"],
      redFlagMessage: "⚠️ Sudden scrotal swelling may be testicular torsion or strangulated hernia — URGENT referral needed!",
    },
    { id: "is_painful", text: "Is the swelling painful?", type: "yes_no", required: true, showIf: (a) => a.has_scrotal_swelling === "yes", helpText: "Hydrocoele is typically painless. Pain suggests infection, torsion, or hernia." },
  ],
  assessmentQuestions: [
    { id: "swelling_side", text: "Which side is affected?", type: "single", required: true, options: [{ value: "left", label: "Left side" }, { value: "right", label: "Right side" }, { value: "both", label: "Both sides" }] },
    { id: "swelling_size", text: "Estimate the size of the swelling:", type: "single", required: true,
      options: [
        { value: "small", label: "Small — orange-sized or smaller" },
        { value: "medium", label: "Medium — grapefruit-sized" },
        { value: "large", label: "Large — melon-sized" },
        { value: "very_large", label: "Very large — hangs below knees" },
      ],
    },
    { id: "can_get_above", text: "Can you 'get above' the swelling? (Feel the top edge above the swelling in the inguinal region)", type: "yes_no", required: true, helpText: "If you CANNOT get above it (swelling extends into the abdomen), it may be a hernia, NOT hydrocoele. This is a critical differentiator." },
    { id: "transillumination", text: "Shine a phone flashlight behind the swelling in a dark room. Does light pass through (glow)?", type: "single", required: true,
      options: [
        { value: "yes_glows", label: "Yes — swelling glows with light" },
        { value: "no_opaque", label: "No — swelling is opaque" },
        { value: "unsure", label: "Not sure / could not test" },
      ],
      helpText: "Hydrocoele (fluid) transmits light and glows. Solid swelling (hernia, tumor) does NOT glow. This is a key diagnostic test.",
      visualAidKey: "hydrocoele_transillumination",
    },
    { id: "work_impact", text: "Does the swelling prevent the person from working or walking?", type: "yes_no", required: true },
    { id: "social_impact", text: "Is the person experiencing social isolation or stigma due to the condition?", type: "yes_no", required: true },
  ],
  stages: [
    { id: "small", label: "Small (<10cm)", description: "Small hydrocoele", visualDescription: "Scrotum slightly enlarged, person can work normally.", color: "text-blue-600" },
    { id: "medium", label: "Medium (10-20cm)", description: "Medium hydrocoele", visualDescription: "Clearly enlarged scrotum, may cause some discomfort during work.", color: "text-amber-600" },
    { id: "large", label: "Large (20-30cm)", description: "Large hydrocoele", visualDescription: "Significantly enlarged, difficulty sitting and walking. Often needs support.", color: "text-orange-600" },
    { id: "very_large", label: "Very Large (>30cm)", description: "Very large hydrocoele", visualDescription: "Massive enlargement, person may be unable to work or move. High social impact.", color: "text-red-600" },
  ],
  decisionRules: [
    { id: "hr1", description: "Classic hydrocoele", condition: (a) => a.has_scrotal_swelling === "yes" && a.is_painful === "no" && a.transillumination === "yes_glows" && a.can_get_above === "yes", result: "likely", message: "Findings consistent with hydrocoele: painless, transilluminates, can get above swelling." },
    { id: "hr2", description: "Possible hernia", condition: (a) => a.has_scrotal_swelling === "yes" && a.can_get_above === "no", result: "red_flag", message: "⚠️ Cannot get above swelling — may be inguinal hernia. Refer for surgical assessment." },
    { id: "hr3", description: "Painful swelling — not typical hydrocoele", condition: (a) => a.has_scrotal_swelling === "yes" && a.is_painful === "yes", result: "red_flag", message: "⚠️ Painful scrotal swelling is NOT typical hydrocoele. May be infection, torsion, or hernia. Refer urgently." },
  ],
  consistencyChecks: [
    { id: "hc1", description: "Painful but classified as hydrocoele", check: (a) => a.is_painful === "yes" && a.transillumination === "yes_glows", errorMessage: "You indicated the swelling is painful but also transilluminates. Hydrocoele is typically painless. Please re-assess pain.", fieldIds: ["is_painful", "transillumination"] },
  ],
  getReferral: (a, stage) => {
    if (a.swelling_onset === "sudden" || a.is_painful === "yes") {
      return { urgency: "emergency", action: "Refer IMMEDIATELY for surgical evaluation. Possible torsion or strangulated hernia.", reason: "Acute painful scrotal swelling", icon: "🆘", color: "text-destructive" };
    }
    if (a.can_get_above === "no") {
      return { urgency: "urgent", action: "Refer for hernia assessment", reason: "Cannot differentiate from hernia", icon: "🚨", color: "text-destructive" };
    }
    if (["large", "very_large"].includes(a.swelling_size) || a.work_impact === "yes") {
      return { urgency: "priority", action: "Refer for hydrocoelectomy (surgical repair)", reason: "Large hydrocoele affecting daily function", icon: "⚠️", color: "text-amber-600" };
    }
    return { urgency: "routine", action: "Record and monitor. Educate on when to seek care. Follow-up in 6 months.", reason: "Small hydrocoele, manageable", icon: "✅", color: "text-emerald-600" };
  },
  getConfidence: (a) => {
    let score = 0;
    if (a.has_scrotal_swelling === "yes") score += 20;
    if (a.transillumination === "yes_glows") score += 25;
    if (a.can_get_above === "yes") score += 20;
    if (a.is_painful === "no") score += 10;
    if (a.swelling_size) score += 10;
    if (a.swelling_side) score += 5;
    if (a.work_impact !== undefined) score += 5;
    if (a.social_impact !== undefined) score += 5;
    return Math.min(score, 100);
  },
};

// ═══════════════════════════════════════════════════════════
// TRACHOMA TRICHIASIS PROTOCOL
// ═══════════════════════════════════════════════════════════

const trachomaProtocol: NTDProtocol = {
  id: "trachoma_trichiasis",
  name: "Trachoma Trichiasis (TT)",
  shortName: "TT",
  description: "Inward turning of eyelashes from repeated trachoma infection, causing corneal damage",
  emoji: "👁️",
  color: "hsl(45, 80%, 45%)",
  screeningQuestions: [
    { id: "has_eye_problem", text: "Does the person have eye pain, irritation, or vision problems?", type: "yes_no", required: true, helpText: "Trachoma Trichiasis causes the eyelashes to turn inward and scratch the eye, leading to pain and vision loss." },
    { id: "lashes_touching", text: "Look closely at the person's eyes. Are any eyelashes touching the eyeball?", type: "single", required: true,
      showIf: (a) => a.has_eye_problem === "yes",
      options: [
        { value: "none", label: "No lashes touching the eye" },
        { value: "few", label: "1-5 lashes touching" },
        { value: "many", label: "6 or more lashes touching" },
        { value: "cannot_tell", label: "Cannot tell clearly" },
      ],
      visualAidKey: "trachoma_inturned_lashes",
      helpText: "Pull down the lower lid gently and look at the upper lid margin. In-turned lashes are the defining sign of TT.",
    },
    { id: "which_eyes", text: "Which eye(s) are affected?", type: "single", required: true, showIf: (a) => a.lashes_touching && a.lashes_touching !== "none",
      options: [{ value: "left", label: "Left eye" }, { value: "right", label: "Right eye" }, { value: "both", label: "Both eyes" }],
    },
  ],
  assessmentQuestions: [
    { id: "corneal_opacity", text: "Can you see any white/cloudy area on the colored part of the eye (cornea)?", type: "yes_no", required: true, visualAidKey: "trachoma_corneal_opacity", helpText: "Corneal opacity is a white area over the pupil. It indicates damage from lashes scratching the eye over time." },
    { id: "vision_status", text: "How is the person's vision?", type: "single", required: true,
      options: [
        { value: "normal", label: "Can see normally" },
        { value: "reduced", label: "Vision reduced but can still see faces" },
        { value: "severely_reduced", label: "Can only see hand movements" },
        { value: "blind", label: "Cannot see at all in affected eye" },
      ],
      redFlagValues: ["blind"],
      redFlagMessage: "Blindness detected — urgent surgical referral needed to prevent further damage.",
    },
    { id: "previous_surgery", text: "Has the person had any previous eye surgery for this condition?", type: "yes_no", required: true, helpText: "Previous TT surgery that has recurred is called 'recurrent TT' and may need repeat surgery." },
    { id: "epilation", text: "Is the person currently removing (plucking) the in-turned lashes themselves?", type: "yes_no", required: true, helpText: "Self-epilation is a coping mechanism but does not treat the underlying condition. It indicates the person needs surgery." },
    { id: "lid_scarring", text: "Can you see scarring or white lines on the inside of the upper eyelid?", type: "yes_no", required: true, visualAidKey: "trachoma_lid_scarring", helpText: "Gently evert (flip) the upper eyelid. White lines or scarring on the tarsal conjunctiva confirms trachomatous scarring." },
  ],
  stages: [
    { id: "minor_tt", label: "Minor TT", description: "1-5 lashes touching eyeball", visualDescription: "Few lashes touching the eye. May or may not have symptoms.", color: "text-amber-600" },
    { id: "major_tt", label: "Major TT", description: "6+ lashes touching", visualDescription: "Multiple lashes touching the eye. Usually symptomatic with pain and tearing.", color: "text-orange-600" },
    { id: "tt_opacity", label: "TT with Corneal Opacity", description: "Lashes touching + cloudy cornea", visualDescription: "In-turned lashes plus visible white area on the cornea. Vision may be affected.", color: "text-red-500" },
    { id: "tt_blind", label: "TT with Visual Impairment", description: "Advanced stage with vision loss", visualDescription: "Significant vision loss or blindness in the affected eye. Usually with severe corneal damage.", color: "text-red-700" },
  ],
  decisionRules: [
    { id: "tr1", description: "Confirmed TT", condition: (a) => a.lashes_touching && ["few", "many"].includes(a.lashes_touching), result: "likely", message: "In-turned eyelashes confirmed. This is Trachoma Trichiasis. Surgery is indicated." },
    { id: "tr2", description: "TT with vision threat", condition: (a) => a.corneal_opacity === "yes" || ["severely_reduced", "blind"].includes(a.vision_status), result: "red_flag", message: "⚠️ URGENT: Corneal damage or vision loss present. Immediate surgical referral required to prevent blindness." },
    { id: "tr3", description: "Recurrent TT", condition: (a) => a.previous_surgery === "yes" && a.lashes_touching && a.lashes_touching !== "none", result: "red_flag", message: "Recurrent TT after surgery. Needs specialist referral." },
  ],
  consistencyChecks: [
    { id: "tc1", description: "No lashes but corneal opacity", check: (a) => a.lashes_touching === "none" && a.corneal_opacity === "yes", errorMessage: "You said no lashes are touching the eye but there is corneal opacity. This may be old TT damage or another eye condition. Please re-examine.", fieldIds: ["lashes_touching", "corneal_opacity"] },
  ],
  getReferral: (a) => {
    if (a.corneal_opacity === "yes" || ["severely_reduced", "blind"].includes(a.vision_status)) {
      return { urgency: "urgent", action: "Refer URGENTLY for TT surgery (lid rotation) to prevent further vision loss", reason: "Corneal damage or vision impairment detected", icon: "🚨", color: "text-destructive" };
    }
    if (a.lashes_touching === "many" || a.previous_surgery === "yes") {
      return { urgency: "priority", action: "Refer for TT surgery within 2 weeks", reason: "Major TT or recurrent TT requiring surgical correction", icon: "⚠️", color: "text-amber-600" };
    }
    if (a.lashes_touching === "few") {
      return { urgency: "priority", action: "Refer for TT surgery. Provide epilation forceps as interim measure.", reason: "Minor TT — surgery is still the recommended treatment", icon: "⚠️", color: "text-amber-600" };
    }
    return { urgency: "routine", action: "No TT detected. Record and continue screening.", reason: "No trichiasis found", icon: "✅", color: "text-emerald-600" };
  },
  getConfidence: (a) => {
    let score = 0;
    if (a.has_eye_problem !== undefined) score += 10;
    if (a.lashes_touching && a.lashes_touching !== "none") score += 30;
    if (a.which_eyes) score += 10;
    if (a.corneal_opacity !== undefined) score += 15;
    if (a.vision_status) score += 15;
    if (a.lid_scarring !== undefined) score += 10;
    if (a.previous_surgery !== undefined) score += 5;
    if (a.epilation !== undefined) score += 5;
    return Math.min(score, 100);
  },
};

// ═══════════════════════════════════════════════════════════
// SNAKEBITE PROTOCOL
// ═══════════════════════════════════════════════════════════

const snakebiteProtocol: NTDProtocol = {
  id: "snakebite",
  name: "Snake Bite Envenoming",
  shortName: "SBE",
  description: "Venomous snake bite requiring case management and follow-up",
  emoji: "🐍",
  color: "hsl(0, 70%, 50%)",
  screeningQuestions: [
    { id: "bitten", text: "Has the person been bitten by a snake?", type: "yes_no", required: true },
    { id: "bite_time", text: "How long ago was the bite?", type: "single", required: true, showIf: (a) => a.bitten === "yes",
      options: [
        { value: "less_1_hour", label: "Less than 1 hour ago" },
        { value: "1_6_hours", label: "1-6 hours ago" },
        { value: "6_24_hours", label: "6-24 hours ago" },
        { value: "more_24_hours", label: "More than 24 hours ago" },
      ],
      redFlagValues: ["less_1_hour", "1_6_hours"],
      redFlagMessage: "⚠️ Recent snakebite — URGENT referral to health facility for antivenom assessment!",
    },
  ],
  assessmentQuestions: [
    { id: "bite_location", text: "Where on the body was the bite?", type: "body_location", required: true },
    { id: "local_signs", text: "What local signs do you see at the bite site?", type: "multi", required: true,
      options: [
        { value: "fang_marks", label: "Visible fang marks" },
        { value: "swelling", label: "Swelling around bite" },
        { value: "bruising", label: "Bruising/discoloration" },
        { value: "bleeding", label: "Persistent bleeding" },
        { value: "necrosis", label: "Black/dead tissue (necrosis)" },
        { value: "none", label: "No visible signs" },
      ],
    },
    { id: "systemic_signs", text: "Does the person have any of these DANGEROUS signs? (Check all that apply)", type: "multi", required: true,
      options: [
        { value: "breathing_difficulty", label: "🫁 Difficulty breathing" },
        { value: "drooping_eyelids", label: "😐 Drooping eyelids" },
        { value: "bleeding_gums", label: "🩸 Bleeding from gums/nose" },
        { value: "dark_urine", label: "🟤 Dark/red urine" },
        { value: "vomiting", label: "🤮 Vomiting" },
        { value: "confusion", label: "😵 Confusion/drowsiness" },
        { value: "none", label: "✅ None of these" },
      ],
      redFlagValues: ["breathing_difficulty", "drooping_eyelids", "bleeding_gums", "dark_urine", "confusion"],
      redFlagMessage: "⚠️ SYSTEMIC ENVENOMING DETECTED — EMERGENCY referral for antivenom!",
    },
    { id: "first_aid_given", text: "What first aid was given?", type: "multi", required: false,
      options: [
        { value: "immobilize", label: "Limb immobilized" },
        { value: "removed_jewelry", label: "Jewelry/tight items removed" },
        { value: "tourniquet", label: "⚠️ Tourniquet applied" },
        { value: "incision", label: "⚠️ Cut/incision made" },
        { value: "traditional", label: "⚠️ Traditional remedy used" },
        { value: "nothing", label: "Nothing done" },
      ],
    },
  ],
  stages: [
    { id: "dry_bite", label: "Dry Bite", description: "No envenoming", visualDescription: "Fang marks visible but no swelling, no bleeding, no systemic signs.", color: "text-blue-600" },
    { id: "mild", label: "Mild Envenoming", description: "Local signs only", visualDescription: "Swelling and pain at bite site. No systemic signs. Person is alert and breathing normally.", color: "text-amber-600" },
    { id: "moderate", label: "Moderate Envenoming", description: "Spreading local + mild systemic", visualDescription: "Swelling spreading beyond bite site. May have nausea, mild bleeding.", color: "text-orange-600" },
    { id: "severe", label: "Severe Envenoming", description: "Systemic signs present", visualDescription: "Difficulty breathing, bleeding from gums, dark urine, confusion. LIFE-THREATENING.", color: "text-red-700" },
  ],
  decisionRules: [
    { id: "sr1", description: "Severe envenoming", condition: (a) => a.systemic_signs?.some((v: string) => ["breathing_difficulty", "drooping_eyelids", "bleeding_gums", "dark_urine", "confusion"].includes(v)), result: "red_flag", message: "🆘 EMERGENCY: Systemic envenoming. Transport to hospital IMMEDIATELY for antivenom." },
    { id: "sr2", description: "Moderate envenoming", condition: (a) => a.local_signs?.some((v: string) => ["necrosis", "bleeding"].includes(v)), result: "red_flag", message: "⚠️ Significant local damage. Refer urgently for wound care and antivenom assessment." },
    { id: "sr3", description: "Dry bite", condition: (a) => a.local_signs?.includes("none") && a.systemic_signs?.includes("none"), result: "unlikely", message: "No signs of envenoming (dry bite). Observe for 24 hours. Seek care if symptoms develop." },
  ],
  consistencyChecks: [],
  getReferral: (a) => {
    const hasSystemic = a.systemic_signs?.some((v: string) => v !== "none");
    if (hasSystemic) {
      return { urgency: "emergency", action: "TRANSPORT TO HOSPITAL IMMEDIATELY for antivenom treatment", reason: "Systemic envenoming signs detected", icon: "🆘", color: "text-destructive" };
    }
    if (a.local_signs?.includes("necrosis")) {
      return { urgency: "urgent", action: "Refer urgently for wound care and possible antivenom", reason: "Tissue necrosis at bite site", icon: "🚨", color: "text-destructive" };
    }
    if (["less_1_hour", "1_6_hours"].includes(a.bite_time)) {
      return { urgency: "urgent", action: "Refer to health facility for observation (minimum 24 hours)", reason: "Recent bite — envenoming may develop", icon: "🚨", color: "text-destructive" };
    }
    return { urgency: "routine", action: "Monitor for 24 hours. Seek care if any new symptoms appear.", reason: "No current signs of envenoming", icon: "✅", color: "text-emerald-600" };
  },
  getConfidence: (a) => {
    let score = 0;
    if (a.bitten === "yes") score += 20;
    if (a.bite_time) score += 10;
    if (a.bite_location) score += 10;
    if (a.local_signs?.length > 0) score += 20;
    if (a.systemic_signs?.length > 0) score += 25;
    if (a.first_aid_given?.length > 0) score += 5;
    return Math.min(score, 100);
  },
};

// ═══════════════════════════════════════════════════════════
// BURULI ULCER PROTOCOL
// ═══════════════════════════════════════════════════════════

const buruliProtocol: NTDProtocol = {
  id: "buruli_ulcer",
  name: "Buruli Ulcer",
  shortName: "BU",
  description: "Chronic necrotizing skin disease caused by Mycobacterium ulcerans",
  emoji: "🩹",
  color: "hsl(30, 70%, 45%)",
  screeningQuestions: [
    { id: "has_skin_lesion", text: "Does the person have a skin lesion (wound, lump, or swelling)?", type: "yes_no", required: true },
    { id: "lesion_painful", text: "Is the lesion painful?", type: "yes_no", required: true, showIf: (a) => a.has_skin_lesion === "yes",
      helpText: "Buruli Ulcer is characteristically PAINLESS. This is a key distinguishing feature from other skin conditions.",
    },
    { id: "lesion_type", text: "What does the lesion look like?", type: "single", required: true, showIf: (a) => a.has_skin_lesion === "yes",
      options: [
        { value: "nodule", label: "Firm, round lump under the skin" },
        { value: "plaque", label: "Flat, raised, hardened area" },
        { value: "edema", label: "Puffy swelling without clear edges" },
        { value: "ulcer", label: "Open wound/ulcer" },
      ],
    },
  ],
  assessmentQuestions: [
    { id: "lesion_location", text: "Where is the lesion located?", type: "body_location", required: true },
    { id: "lesion_size", text: "Estimate the size of the lesion:", type: "single", required: true,
      options: [
        { value: "less_5cm", label: "Less than 5 cm" },
        { value: "5_15cm", label: "5-15 cm" },
        { value: "more_15cm", label: "More than 15 cm" },
      ],
    },
    { id: "undermined_edges", text: "If it's an ulcer, does it have overhanging/undermined edges?", type: "yes_no", required: false,
      showIf: (a) => a.lesion_type === "ulcer",
      helpText: "Undermined edges (edges overhang the base) are highly characteristic of Buruli Ulcer. Look at the wound edge — can you slide a probe under the skin edge?",
    },
    { id: "has_fever", text: "Does the person have fever?", type: "yes_no", required: true,
      helpText: "Buruli Ulcer typically does NOT cause fever. If the person has fever, consider other diagnoses.",
    },
    { id: "near_water", text: "Does the person live near a river, stream, or swampy area?", type: "yes_no", required: false,
      helpText: "Buruli Ulcer is associated with proximity to slow-moving or stagnant water bodies.",
    },
    { id: "joint_involved", text: "Is the lesion over or near a joint?", type: "yes_no", required: true,
      helpText: "Lesions near joints can lead to contractures (permanent joint stiffness) if not treated early.",
      redFlagValues: ["yes"],
      redFlagMessage: "Joint involvement — early treatment critical to prevent disability.",
    },
  ],
  stages: [
    { id: "cat_1", label: "Category I", description: "Single small lesion (<5cm)", visualDescription: "Single nodule, plaque, or small ulcer less than 5 cm in diameter.", color: "text-blue-600" },
    { id: "cat_2", label: "Category II", description: "Plaque/oedema/ulcer 5-15cm", visualDescription: "Larger lesion or non-ulcerative form (plaque/edema) between 5 and 15 cm.", color: "text-amber-600" },
    { id: "cat_3", label: "Category III", description: "Disseminated or >15cm", visualDescription: "Very large lesion (>15cm), multiple lesions, or involvement of critical sites like eyes, joints.", color: "text-red-600" },
  ],
  decisionRules: [
    { id: "br1", description: "Classic BU presentation", condition: (a) => a.has_skin_lesion === "yes" && a.lesion_painful === "no" && a.has_fever === "no", result: "likely", message: "Painless lesion without fever is consistent with Buruli Ulcer. Confirm with laboratory testing." },
    { id: "br2", description: "Undermined edges — strong indicator", condition: (a) => a.undermined_edges === "yes", result: "likely", message: "Undermined wound edges are highly characteristic of BU. Strongly suspect Buruli Ulcer." },
    { id: "br3", description: "Painful lesion with fever", condition: (a) => a.lesion_painful === "yes" && a.has_fever === "yes", result: "unlikely", message: "Painful lesion WITH fever is NOT typical of BU. Consider bacterial abscess, tropical ulcer, or other infection." },
  ],
  consistencyChecks: [
    { id: "bc1", description: "Painful BU", check: (a) => a.lesion_painful === "yes" && a.undermined_edges === "yes", errorMessage: "You indicated the lesion is painful but has undermined edges (typical BU). BU is usually painless. Please re-assess pain.", fieldIds: ["lesion_painful"] },
  ],
  getReferral: (a) => {
    if (a.joint_involved === "yes" || a.lesion_size === "more_15cm") {
      return { urgency: "urgent", action: "Refer urgently for confirmation and antibiotic treatment. Risk of permanent disability.", reason: "Large lesion or joint involvement", icon: "🚨", color: "text-destructive" };
    }
    if (a.lesion_type === "ulcer") {
      return { urgency: "priority", action: "Refer for laboratory confirmation and 8-week antibiotic regimen", reason: "Active ulcer requires treatment", icon: "⚠️", color: "text-amber-600" };
    }
    return { urgency: "priority", action: "Refer for clinical confirmation. Early treatment prevents ulceration.", reason: "Suspected BU — early confirmation needed", icon: "⚠️", color: "text-amber-600" };
  },
  getConfidence: (a) => {
    let score = 0;
    if (a.has_skin_lesion === "yes") score += 15;
    if (a.lesion_painful === "no") score += 20;
    if (a.lesion_type) score += 10;
    if (a.lesion_location) score += 5;
    if (a.lesion_size) score += 10;
    if (a.undermined_edges === "yes") score += 20;
    if (a.has_fever === "no") score += 10;
    if (a.near_water !== undefined) score += 5;
    if (a.joint_involved !== undefined) score += 5;
    return Math.min(score, 100);
  },
};

// ═══════════════════════════════════════════════════════════
// HAT PROTOCOL
// ═══════════════════════════════════════════════════════════

const hatProtocol: NTDProtocol = {
  id: "hat",
  name: "Human African Trypanosomiasis (HAT)",
  shortName: "HAT",
  description: "Sleeping sickness caused by Trypanosoma parasites via tsetse fly",
  emoji: "🪰",
  color: "hsl(270, 60%, 50%)",
  screeningQuestions: [
    { id: "tsetse_area", text: "Does the person live in or recently visited a tsetse fly area?", type: "yes_no", required: true, helpText: "HAT is transmitted only by tsetse flies. Endemic areas include rural sub-Saharan Africa near rivers and forests." },
    { id: "has_chancre", text: "Does the person have a painful sore/swelling at a fly bite site?", type: "yes_no", required: true, showIf: (a) => a.tsetse_area === "yes", helpText: "A 'chancre' is a red, painful swelling at the tsetse bite site. It appears 1-3 weeks after being bitten." },
    { id: "has_sleep_problems", text: "Does the person have unusual sleep patterns — sleeping during the day and awake at night?", type: "yes_no", required: true, showIf: (a) => a.tsetse_area === "yes", helpText: "Disrupted sleep-wake cycle is the hallmark of sleeping sickness, especially in Stage 2." },
  ],
  assessmentQuestions: [
    { id: "fever_pattern", text: "Does the person have intermittent fever?", type: "yes_no", required: true },
    { id: "swollen_lymph_nodes", text: "Check the back of the neck. Are lymph nodes swollen?", type: "yes_no", required: true, helpText: "Winterbottom's sign — swollen posterior cervical lymph nodes is a classic HAT finding." },
    { id: "neurological_signs", text: "Does the person show any of these neurological signs?", type: "multi", required: true,
      options: [
        { value: "confusion", label: "Confusion or personality changes" },
        { value: "tremors", label: "Tremors or shaking" },
        { value: "difficulty_walking", label: "Difficulty walking / poor coordination" },
        { value: "speech_problems", label: "Slurred speech" },
        { value: "none", label: "None of these" },
      ],
      redFlagValues: ["confusion", "tremors", "difficulty_walking", "speech_problems"],
      redFlagMessage: "Neurological signs suggest Stage 2 (CNS involvement). URGENT referral for lumbar puncture and treatment.",
    },
    { id: "itching", text: "Does the person have intense generalized itching?", type: "yes_no", required: true },
    { id: "weight_loss", text: "Has the person lost significant weight recently?", type: "yes_no", required: true },
  ],
  stages: [
    { id: "stage_1", label: "Stage 1 — Haemolymphatic", description: "Early stage (blood & lymph)", visualDescription: "Fever, headache, swollen lymph nodes, itching. Parasite in blood/lymph. TREATABLE.", color: "text-amber-600" },
    { id: "stage_2", label: "Stage 2 — Meningoencephalitic", description: "Late stage (CNS involvement)", visualDescription: "Sleep disturbance, confusion, tremors, personality changes. Parasite has crossed into brain. FATAL if untreated.", color: "text-red-700" },
  ],
  decisionRules: [
    { id: "hatr1", description: "Stage 2 HAT", condition: (a) => a.has_sleep_problems === "yes" && a.neurological_signs?.some((v: string) => v !== "none"), result: "red_flag", message: "🆘 Stage 2 HAT suspected (CNS involvement). URGENT referral. Without treatment, this is FATAL." },
    { id: "hatr2", description: "Stage 1 suspect", condition: (a) => a.tsetse_area === "yes" && a.fever_pattern === "yes" && a.swollen_lymph_nodes === "yes", result: "likely", message: "Pattern consistent with Stage 1 HAT. Refer for blood testing (card agglutination test)." },
  ],
  consistencyChecks: [],
  getReferral: (a) => {
    const hasNeuro = a.neurological_signs?.some((v: string) => v !== "none");
    if (hasNeuro || a.has_sleep_problems === "yes") {
      return { urgency: "emergency", action: "REFER IMMEDIATELY for lumbar puncture and Stage 2 treatment", reason: "Suspected Stage 2 HAT — fatal without treatment", icon: "🆘", color: "text-destructive" };
    }
    if (a.tsetse_area === "yes" && (a.fever_pattern === "yes" || a.swollen_lymph_nodes === "yes")) {
      return { urgency: "urgent", action: "Refer for blood screening (CATT) within 48 hours", reason: "Suspected Stage 1 HAT", icon: "🚨", color: "text-destructive" };
    }
    return { urgency: "routine", action: "No strong HAT indicators. Record and continue surveillance.", reason: "Low suspicion", icon: "✅", color: "text-emerald-600" };
  },
  getConfidence: (a) => {
    let score = 0;
    if (a.tsetse_area === "yes") score += 15;
    if (a.has_chancre === "yes") score += 15;
    if (a.has_sleep_problems === "yes") score += 15;
    if (a.fever_pattern !== undefined) score += 10;
    if (a.swollen_lymph_nodes !== undefined) score += 15;
    if (a.neurological_signs?.length > 0) score += 15;
    if (a.itching !== undefined) score += 5;
    if (a.weight_loss !== undefined) score += 5;
    return Math.min(score, 100);
  },
};

// ═══════════════════════════════════════════════════════════
// LEPROSY PROTOCOL
// ═══════════════════════════════════════════════════════════

const leprosyProtocol: NTDProtocol = {
  id: "leprosy",
  name: "Leprosy (Hansen's Disease)",
  shortName: "Leprosy",
  description: "Chronic infection affecting skin, nerves, and mucosa caused by M. leprae",
  emoji: "🤲",
  color: "hsl(160, 50%, 40%)",
  screeningQuestions: [
    { id: "has_patches", text: "Does the person have pale/light or reddish patches on the skin?", type: "yes_no", required: true, visualAidKey: "leprosy_patches", helpText: "Look for lighter or redder patches compared to surrounding skin. They may be flat or slightly raised." },
    { id: "patch_sensation", text: "Touch the patch lightly with a cotton wisp or pen tip. Can the person feel it?", type: "single", required: true,
      showIf: (a) => a.has_patches === "yes",
      options: [
        { value: "normal", label: "Yes — normal feeling" },
        { value: "reduced", label: "Reduced — can barely feel" },
        { value: "absent", label: "No — cannot feel at all" },
      ],
      helpText: "Loss of sensation in a skin patch is THE cardinal sign of leprosy. Test on the patch AND on normal skin for comparison.",
    },
    { id: "nerve_thickening", text: "Feel the main nerve areas (elbow, behind knee, wrist). Are any nerves thickened or tender?", type: "yes_no", required: true, helpText: "Thickened peripheral nerves are another cardinal sign. Compare both sides. The ulnar nerve (inner elbow) and peroneal nerve (below knee) are most commonly affected." },
  ],
  assessmentQuestions: [
    { id: "num_patches", text: "How many skin patches does the person have?", type: "single", required: true,
      options: [
        { value: "1", label: "Just 1 patch" },
        { value: "2_5", label: "2-5 patches" },
        { value: "6_plus", label: "6 or more patches" },
      ],
      helpText: "The number of patches determines the type: 1-5 patches = Paucibacillary (PB). 6+ patches = Multibacillary (MB). This determines treatment duration.",
    },
    { id: "deformity", text: "Does the person have any deformity of hands, feet, or face?", type: "multi", required: true,
      options: [
        { value: "claw_hand", label: "Claw hand (fingers curled)" },
        { value: "foot_drop", label: "Foot drop (difficulty lifting foot)" },
        { value: "lagophthalmos", label: "Cannot close eye fully" },
        { value: "absorption", label: "Shortened fingers/toes" },
        { value: "none", label: "No deformity" },
      ],
      redFlagValues: ["lagophthalmos"],
      redFlagMessage: "Cannot close eye — risk of corneal damage and blindness. Urgent ophthalmology referral.",
    },
    { id: "wounds_ulcers", text: "Does the person have painless wounds or ulcers on hands or feet?", type: "yes_no", required: true, helpText: "Due to loss of sensation, people with leprosy may injure themselves without knowing. Painless wounds are a sign of nerve damage." },
    { id: "treatment_history", text: "Has the person ever been treated for leprosy before?", type: "single", required: true,
      options: [
        { value: "never", label: "Never treated" },
        { value: "completed", label: "Completed treatment" },
        { value: "incomplete", label: "Started but didn't finish" },
        { value: "unknown", label: "Don't know" },
      ],
    },
  ],
  stages: [
    { id: "pb", label: "Paucibacillary (PB)", description: "1-5 patches, fewer bacteria", visualDescription: "1 to 5 skin patches with loss of sensation. May have one thickened nerve. Treatment: 6 months MDT.", color: "text-amber-600" },
    { id: "mb", label: "Multibacillary (MB)", description: "6+ patches, more bacteria", visualDescription: "6 or more patches, possibly nodules on skin, multiple nerve involvement. Treatment: 12 months MDT.", color: "text-orange-600" },
    { id: "disability_g1", label: "Grade 1 Disability", description: "Loss of sensation, no visible deformity", visualDescription: "Numbness in hands or feet but no visible damage or deformity.", color: "text-red-500" },
    { id: "disability_g2", label: "Grade 2 Disability", description: "Visible deformity", visualDescription: "Claw hand, foot drop, eye problems, shortened digits, ulcers.", color: "text-red-700" },
  ],
  decisionRules: [
    { id: "lepr1", description: "Cardinal signs present", condition: (a) => a.has_patches === "yes" && a.patch_sensation !== "normal" && a.nerve_thickening === "yes", result: "likely", message: "Two cardinal signs present (anesthetic patch + thickened nerve). Strongly suspect leprosy. Refer for confirmation and MDT." },
    { id: "lepr2", description: "Patch with loss of sensation", condition: (a) => a.has_patches === "yes" && a.patch_sensation === "absent", result: "likely", message: "Skin patch with complete loss of sensation — highly suggestive of leprosy." },
    { id: "lepr3", description: "Deformity present", condition: (a) => a.deformity?.some((v: string) => v !== "none"), result: "red_flag", message: "Deformity detected — indicates advanced nerve damage. Urgent start of treatment and rehabilitation needed." },
  ],
  consistencyChecks: [
    { id: "lepc1", description: "Normal sensation but deformity", check: (a) => a.patch_sensation === "normal" && a.deformity?.some((v: string) => v !== "none"), errorMessage: "You indicated normal sensation in patches but deformity is present. Deformity typically occurs with nerve damage (loss of sensation). Please re-test sensation.", fieldIds: ["patch_sensation", "deformity"] },
  ],
  getReferral: (a) => {
    if (a.deformity?.includes("lagophthalmos")) {
      return { urgency: "urgent", action: "Refer for eye protection and ophthalmology assessment", reason: "Cannot close eye — risk of blindness", icon: "🚨", color: "text-destructive" };
    }
    if (a.deformity?.some((v: string) => v !== "none")) {
      return { urgency: "priority", action: "Start MDT immediately. Refer for disability assessment and rehabilitation.", reason: "Deformity present — needs treatment + rehabilitation", icon: "⚠️", color: "text-amber-600" };
    }
    if (a.patch_sensation !== "normal") {
      return { urgency: "priority", action: "Refer to confirm diagnosis and start MDT (Multi-Drug Therapy)", reason: "Suspected leprosy — cardinal signs present", icon: "⚠️", color: "text-amber-600" };
    }
    return { urgency: "routine", action: "Record findings. Continue active case search. Follow up in 3 months.", reason: "No strong leprosy indicators at this time", icon: "✅", color: "text-emerald-600" };
  },
  getConfidence: (a) => {
    let score = 0;
    if (a.has_patches === "yes") score += 15;
    if (a.patch_sensation && a.patch_sensation !== "normal") score += 25;
    if (a.nerve_thickening === "yes") score += 20;
    if (a.num_patches) score += 10;
    if (a.deformity?.length > 0) score += 10;
    if (a.wounds_ulcers !== undefined) score += 10;
    if (a.treatment_history) score += 10;
    return Math.min(score, 100);
  },
};

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

export const NTD_PROTOCOLS: NTDProtocol[] = [
  lymphoedemaProtocol,
  hydrocoeleProtocol,
  trachomaProtocol,
  snakebiteProtocol,
  buruliProtocol,
  hatProtocol,
  leprosyProtocol,
];

export function getProtocol(id: string): NTDProtocol | undefined {
  return NTD_PROTOCOLS.find(p => p.id === id);
}

/** Run all applicable decision rules and return matches */
export function evaluateDecisionRules(protocol: NTDProtocol, answers: Record<string, any>) {
  return protocol.decisionRules.filter(r => r.condition(answers));
}

/** Run all consistency checks and return violations */
export function runConsistencyChecks(protocol: NTDProtocol, answers: Record<string, any>) {
  return protocol.consistencyChecks.filter(c => c.check(answers));
}

/** Get all visible questions based on current answers */
export function getVisibleQuestions(questions: ScreeningQuestion[], answers: Record<string, any>) {
  return questions.filter(q => !q.showIf || q.showIf(answers));
}

/** Check if any red flags are triggered */
export function checkRedFlags(questions: ScreeningQuestion[], answers: Record<string, any>) {
  const flags: { questionId: string; message: string }[] = [];
  questions.forEach(q => {
    if (!q.redFlagValues || !q.redFlagMessage) return;
    const val = answers[q.id];
    if (Array.isArray(val)) {
      if (val.some(v => q.redFlagValues!.includes(v))) flags.push({ questionId: q.id, message: q.redFlagMessage! });
    } else if (q.redFlagValues.includes(val)) {
      flags.push({ questionId: q.id, message: q.redFlagMessage! });
    }
  });
  return flags;
}

/** Auto-suggest severity stage based on answers */
export function suggestStage(protocol: NTDProtocol, answers: Record<string, any>): string | null {
  switch (protocol.id) {
    case "lymphoedema": {
      if (answers.skin_changes?.includes("mossy")) return "stage_6";
      if (answers.skin_changes?.includes("knobs")) return "stage_4";
      if (answers.skin_changes?.includes("deep_folds")) return "stage_5";
      if (answers.skin_changes?.includes("shallow_folds")) return "stage_3";
      if (answers.skin_changes?.includes("thickened")) return "stage_2";
      if (answers.swelling_reduces_overnight === "yes") return "stage_1";
      if (answers.swelling_reduces_overnight === "no") return "stage_2";
      return null;
    }
    case "hydrocoele":
      return answers.swelling_size === "very_large" ? "very_large" : answers.swelling_size === "large" ? "large" : answers.swelling_size === "medium" ? "medium" : answers.swelling_size === "small" ? "small" : null;
    case "trachoma_trichiasis": {
      if (["severely_reduced", "blind"].includes(answers.vision_status)) return "tt_blind";
      if (answers.corneal_opacity === "yes") return "tt_opacity";
      if (answers.lashes_touching === "many") return "major_tt";
      if (answers.lashes_touching === "few") return "minor_tt";
      return null;
    }
    case "snakebite": {
      const hasSystemic = answers.systemic_signs?.some((v: string) => v !== "none");
      if (hasSystemic) return "severe";
      if (answers.local_signs?.includes("necrosis") || answers.local_signs?.includes("bleeding")) return "moderate";
      if (answers.local_signs?.some((v: string) => v !== "none")) return "mild";
      if (answers.local_signs?.includes("none")) return "dry_bite";
      return null;
    }
    case "buruli_ulcer": {
      if (answers.lesion_size === "more_15cm") return "cat_3";
      if (answers.lesion_size === "5_15cm") return "cat_2";
      if (answers.lesion_size === "less_5cm") return "cat_1";
      return null;
    }
    case "hat": {
      const hasNeuro = answers.neurological_signs?.some((v: string) => v !== "none");
      if (hasNeuro || answers.has_sleep_problems === "yes") return "stage_2";
      return "stage_1";
    }
    case "leprosy": {
      if (answers.deformity?.some((v: string) => v !== "none")) return "disability_g2";
      if (answers.patch_sensation === "absent" || answers.wounds_ulcers === "yes") return "disability_g1";
      if (answers.num_patches === "6_plus") return "mb";
      return "pb";
    }
    default: return null;
  }
}
