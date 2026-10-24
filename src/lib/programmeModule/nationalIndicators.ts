// Standard programme indicators sent through the DHIS2 Data Exchange.
// Definitions follow WHO NTD/MMDP (lymphatic filariasis, hydrocoele, trachoma/TT,
// onchocerciasis, PC-NTD MDA), WHO mhGAP/NMHP, WHO/UNICEF JMP (WASH), WHO eye-care
// (eCSC/eREC) and standard livelihood output indicators that Nigeria's national
// programmes aggregate in DHIS2. Mirror: supabase/functions/_shared/nationalIndicators.ts

export type IndicatorArea = "core" | "ntd" | "eye" | "mental" | "wash" | "livelihood" | "health_system";

export interface IndicatorRows {
  services: { component_key: string | null; service_name: string | null; result: string | null; beneficiary_id: string | null }[];
  referrals: { component_key: string | null; status: string | null; outcome: string | null }[];
  mda: { outcome: string | null; drug: string | null; age_years: number | null; sex: string | null; adverse_event: boolean | null; adverse_event_serious: boolean | null }[];
  morbidity: { condition: string | null; stage: string | null; self_care_kit_issued: boolean | null; self_care_trained: boolean | null; surgery_status: string | null; acute_attacks_last_year: number | null }[];
  cases: { condition: string | null; confirmed_condition: string | null; confirmed_at: string | null; status: string | null }[];
  livelihood: { decision: string | null; priority_band: string | null }[];
  visits: { status: string | null; found_at_home: boolean | null }[];
}

export interface NationalIndicator {
  key: string;
  label: string;
  area: IndicatorArea;
  /** Standard definition shown to the person mapping it. */
  definition: string;
  compute: (r: IndicatorRows) => number;
}

const t = (v: unknown) => String(v ?? "").toLowerCase();
const rx = (p: RegExp) => (s: unknown) => p.test(t(s));
const AREA: Record<Exclude<IndicatorArea, "core">, RegExp> = {
  ntd: /mmdp|ntd|morbidity|lymph|hydro|trachom|trichiasis|oncho|schisto|filaria|lesion/,
  eye: /eye|ophthal|vision|cataract|optom/,
  mental: /mental|psycho|mhpss|mhgap|depress/,
  wash: /wash|water|sanitation|hygiene/,
  livelihood: /livelihood|economic|empower|income|vocation/,
  health_system: /health_system|system|facility/,
};
const inArea = (a: keyof typeof AREA) => (s: { component_key: string | null }) => AREA[a].test(t(s.component_key));

/** Services in an area whose name and/or result match. */
const svc = (a: keyof typeof AREA, name?: RegExp, result?: RegExp) => (r: IndicatorRows) =>
  r.services.filter((s) => inArea(a)(s) && (!name || name.test(t(s.service_name))) && (!result || result.test(t(s.result)))).length;
/** Unique people with any matching service in an area. */
const people = (a: keyof typeof AREA, name?: RegExp, result?: RegExp) => (r: IndicatorRows) =>
  new Set(r.services.filter((s) => inArea(a)(s) && (!name || name.test(t(s.service_name))) && (!result || result.test(t(s.result)))).map((s) => s.beneficiary_id)).size;
const morb = (cond: RegExp, extra: (m: IndicatorRows["morbidity"][number]) => boolean = () => true) => (r: IndicatorRows) =>
  r.morbidity.filter((m) => cond.test(t(m.condition)) && extra(m)).length;
const confirmed = (cond: RegExp) => (r: IndicatorRows) =>
  r.cases.filter((c) => c.confirmed_at && cond.test(t(c.confirmed_condition || c.condition))).length;
const treated = (m: IndicatorRows["mda"][number]) => /treat|swallow|given|taken/.test(t(m.outcome));
const mdaDrug = (d: RegExp, extra: (m: IndicatorRows["mda"][number]) => boolean = () => true) => (r: IndicatorRows) =>
  r.mda.filter((m) => treated(m) && d.test(t(m.drug)) && extra(m)).length;
const refs = (a: keyof typeof AREA, status?: RegExp) => (r: IndicatorRows) =>
  r.referrals.filter((x) => inArea(a)(x) && (!status || status.test(`${t(x.status)} ${t(x.outcome)}`))).length;

const LF = /lymph|lf\b|elephant/;
const HYD = /hydro/;
const TT = /trichiasis|\btt\b/;

export const NATIONAL_INDICATORS: NationalIndicator[] = [
  // ---------- NTD / MMDP (WHO LF MMDP minimum package, trachoma TT, PC-NTD MDA) ----------
  { key: "ntd:lf_lymphoedema_cases_identified", area: "ntd", label: "Number of lymphoedema cases confirmed (LF)", definition: "New lymphoedema patients clinically confirmed in the month (WHO MMDP case identification).", compute: (r) => confirmed(LF)(r) + svc("ntd", /lymphoedema case confirmation/, /confirmed/)(r) },
  { key: "ntd:hydrocoele_cases_identified", area: "ntd", label: "Number of hydrocoele cases confirmed (LF)", definition: "New hydrocoele cases clinically confirmed in the month.", compute: (r) => confirmed(HYD)(r) + svc("ntd", /hydrocoele case confirmation/, /confirmed/)(r) },
  { key: "ntd:tt_cases_identified", area: "ntd", label: "Number of trachomatous trichiasis (TT) cases confirmed", definition: "Trachomatous trichiasis cases confirmed in the month.", compute: (r) => confirmed(TT)(r) + svc("ntd", /tt case confirmation/, /confirmed/)(r) },
  { key: "ntd:oncho_skin_cases_identified", area: "ntd", label: "Number of onchocercal skin disease cases confirmed", definition: "Onchocercal skin disease cases confirmed in the month.", compute: (r) => confirmed(/oncho/)(r) + svc("ntd", /oncho.*(confirmation|assessment)/, /confirmed/)(r) },
  { key: "ntd:lymphoedema_patients_managed", area: "ntd", label: "Number of lymphoedema patients under morbidity management (LF)", definition: "Lymphoedema morbidity records reviewed/managed in the month.", compute: (r) => morb(LF)(r) + svc("ntd", /limb care|lymphoedema care/)(r) },
  { key: "ntd:lymphoedema_self_care_trained", area: "ntd", label: "Number of lymphoedema patients trained in self-care", definition: "Lymphoedema patients trained in limb hygiene/self-care (WHO MMDP essential package).", compute: (r) => morb(LF, (m) => !!m.self_care_trained)(r) + svc("ntd", /self-?care training/)(r) },
  { key: "ntd:self_care_kits_issued", area: "ntd", label: "Number of lymphoedema self-care kits issued", definition: "Patients given a lymphoedema self-care kit.", compute: (r) => morb(/./, (m) => !!m.self_care_kit_issued)(r) + svc("ntd", /self-?care kit/)(r) },
  { key: "ntd:adla_episodes_managed", area: "ntd", label: "Number of acute attacks (ADLA) managed", definition: "Acute dermatolymphangioadenitis episodes treated.", compute: svc("ntd", /acute attack|adla/) },
  { key: "ntd:lymphoedema_stage_advanced", area: "ntd", label: "Number of lymphoedema patients at advanced stage (4–7)", definition: "Lymphoedema patients recorded at Dreyer stage 4 or above.", compute: (r) => morb(LF, (m) => /[4-7]|advanced|severe/.test(t(m.stage)))(r) + svc("ntd", undefined, /stage 4.7|advanced/)(r) },
  { key: "ntd:hydrocoelectomies_performed", area: "ntd", label: "Number of hydrocoelectomies performed", definition: "Hydrocoele surgeries completed in the month.", compute: (r) => morb(HYD, (m) => /done|complete|perform/.test(t(m.surgery_status)))(r) + svc("ntd", /hydrocoele surgery|hydrocoelectomy/, /success|complet/)(r) },
  { key: "ntd:hydrocoele_surgery_complications", area: "ntd", label: "Number of hydrocoele post-surgical complications", definition: "Post-operative complications recorded after hydrocoelectomy.", compute: svc("ntd", undefined, /post-?surgical complication/) },
  { key: "ntd:tt_surgeries_performed", area: "ntd", label: "Number of trachomatous trichiasis (TT) surgeries performed", definition: "Trichiasis surgeries completed (WHO TT surgery indicator).", compute: (r) => svc("ntd", TT)(r) + svc("eye", /trichiasis|tt\) surgery/)(r) },
  { key: "ntd:mda_persons_treated", area: "ntd", label: "Number of persons treated with preventive chemotherapy (all PC-NTD drugs)", definition: "People who swallowed preventive chemotherapy in the month.", compute: (r) => r.mda.filter(treated).length + svc("ntd", /^mda/, /treated|swallow/)(r) },
  { key: "ntd:mda_treated_ivermectin", area: "ntd", label: "Number of persons treated with ivermectin (Oncho/LF)", definition: "People treated with ivermectin (alone or combined).", compute: (r) => mdaDrug(/ivermectin|mectizan/)(r) + svc("ntd", /^mda.*ivermectin/, /treated|swallow/)(r) },
  { key: "ntd:mda_treated_albendazole", area: "ntd", label: "Number of persons treated with albendazole (LF/STH)", definition: "People treated with albendazole (alone or combined).", compute: (r) => mdaDrug(/albendazole/)(r) + svc("ntd", /^mda.*albendazole/, /treated|swallow/)(r) },
  { key: "ntd:mda_treated_praziquantel", area: "ntd", label: "Number of persons treated with praziquantel (SCH)", definition: "People treated with praziquantel for schistosomiasis.", compute: (r) => mdaDrug(/praziquantel/)(r) + svc("ntd", /^mda.*praziquantel/, /treated|swallow/)(r) },
  { key: "ntd:mda_treated_azithromycin", area: "ntd", label: "Number of persons treated with azithromycin (Trachoma)", definition: "People treated with azithromycin/tetracycline eye ointment.", compute: (r) => mdaDrug(/azithro|zithromax|tetracycline/)(r) + svc("ntd", /^mda.*(azithro|tetracycline)/, /treated|swallow/)(r) },
  { key: "ntd:mda_treated_mebendazole", area: "ntd", label: "Number of persons treated with mebendazole (STH)", definition: "People treated with mebendazole.", compute: (r) => mdaDrug(/mebendazole/)(r) + svc("ntd", /^mda.*mebendazole/, /treated|swallow/)(r) },
  { key: "ntd:mda_sac_treated", area: "ntd", label: "Number of school-age children (5–14 years) treated", definition: "Treated persons aged 5–14 years (WHO SAC denominator group).", compute: (r) => r.mda.filter((m) => treated(m) && (m.age_years ?? -1) >= 5 && (m.age_years ?? 99) <= 14).length },
  { key: "ntd:mda_adults_treated", area: "ntd", label: "Number of adults (15+ years) treated", definition: "Treated persons aged 15 years and over.", compute: (r) => r.mda.filter((m) => treated(m) && (m.age_years ?? -1) >= 15).length },
  { key: "ntd:mda_female_treated", area: "ntd", label: "Number of females treated", definition: "Treated persons recorded as female.", compute: (r) => r.mda.filter((m) => treated(m) && t(m.sex).startsWith("f")).length },
  { key: "ntd:mda_male_treated", area: "ntd", label: "Number of males treated", definition: "Treated persons recorded as male.", compute: (r) => r.mda.filter((m) => treated(m) && t(m.sex).startsWith("m")).length },
  { key: "ntd:mda_absent_refused", area: "ntd", label: "Number of persons absent or refusing treatment", definition: "Eligible persons not treated because absent or refusing.", compute: (r) => r.mda.filter((m) => /absent|refus/.test(t(m.outcome))).length + svc("ntd", /^mda/, /absent|refus/)(r) },
  { key: "ntd:mda_not_eligible", area: "ntd", label: "Number of persons not eligible for treatment", definition: "Persons excluded (age, pregnancy, illness) per drug guidelines.", compute: (r) => r.mda.filter((m) => /not.?eligible|exclud/.test(t(m.outcome))).length + svc("ntd", /^mda/, /not eligible/)(r) },
  { key: "ntd:mda_adverse_events", area: "ntd", label: "Number of adverse events reported", definition: "Adverse events following drug administration.", compute: (r) => r.mda.filter((m) => m.adverse_event).length + svc("ntd", /^mda|adverse/, /adverse event/)(r) },
  { key: "ntd:mda_serious_adverse_events", area: "ntd", label: "Number of serious adverse events (SAE) reported", definition: "Serious adverse events requiring notification.", compute: (r) => r.mda.filter((m) => m.adverse_event_serious).length + svc("ntd", /^mda|adverse/, /serious adverse/)(r) },
  { key: "ntd:referrals_made", area: "ntd", label: "Number of referrals made for NTD/MMDP cases", definition: "NTD/MMDP referrals issued.", compute: refs("ntd") },

  // ---------- Eye health (WHO eCSC / eREC, NPEH) ----------
  { key: "eye:persons_screened", area: "eye", label: "Number of persons screened for visual acuity", definition: "Persons with presenting visual acuity measured.", compute: people("eye", /visual acuity|screen/) },
  { key: "eye:visual_impairment_detected", area: "eye", label: "Number of persons with visual impairment detected (VA < 6/12)", definition: "Persons with presenting VA worse than 6/12 in the better eye.", compute: svc("eye", undefined, /visual impairment|severe impairment|blind/) },
  { key: "eye:blindness_detected", area: "eye", label: "Number of persons with blindness detected (VA < 3/60)", definition: "Persons with severe impairment or blindness.", compute: svc("eye", undefined, /severe impairment|blind/) },
  { key: "eye:refractions_done", area: "eye", label: "Number of refractions performed", definition: "Refraction examinations completed.", compute: svc("eye", /refraction/) },
  { key: "eye:spectacles_dispensed", area: "eye", label: "Number of spectacles dispensed (eREC)", definition: "Spectacles provided to persons with refractive error.", compute: svc("eye", /glasses|spectacle/) },
  { key: "eye:cataract_detected", area: "eye", label: "Number of cataract cases detected and referred", definition: "Operable cataract identified and referred.", compute: svc("eye", undefined, /cataract detected/) },
  { key: "eye:cataract_surgeries", area: "eye", label: "Number of cataract surgeries performed (eCSC)", definition: "Cataract operations completed.", compute: svc("eye", /cataract surgery/) },
  { key: "eye:cataract_good_outcome", area: "eye", label: "Number of cataract surgeries with good outcome", definition: "Cataract surgeries with a successful/improved visual outcome.", compute: svc("eye", /cataract surgery/, /success|improv/) },
  { key: "eye:glaucoma_screened", area: "eye", label: "Number of glaucoma screenings conducted", definition: "Glaucoma screenings completed.", compute: svc("eye", /glaucoma/) },
  { key: "eye:trachoma_screened", area: "eye", label: "Number of persons screened for trachoma/TT", definition: "Persons screened for trachoma or trichiasis.", compute: svc("eye", /trachoma screening/) },
  { key: "eye:referrals_made", area: "eye", label: "Number of eye health referrals made", definition: "Eye health referrals issued.", compute: refs("eye") },

  // ---------- Mental health (WHO mhGAP / NMHP) ----------
  { key: "mental:persons_assessed", area: "mental", label: "Number of persons assessed for mental health conditions (mhGAP)", definition: "Unique persons with a mental-health assessment.", compute: people("mental", /gad|phq|assessment|review/) },
  { key: "mental:phq9_screenings", area: "mental", label: "Number of PHQ-9 depression screenings conducted", definition: "PHQ-9 assessments completed.", compute: svc("mental", /phq/) },
  { key: "mental:gad7_screenings", area: "mental", label: "Number of GAD-7 anxiety screenings conducted", definition: "GAD-7 assessments completed.", compute: svc("mental", /gad/) },
  { key: "mental:moderate_severe_symptoms", area: "mental", label: "Number of persons with moderate–severe symptoms identified", definition: "Assessments scoring moderate, moderately severe or severe.", compute: svc("mental", undefined, /moderate|severe/) },
  { key: "mental:persons_receiving_care", area: "mental", label: "Number of persons receiving mental health care (service coverage)", definition: "Unique persons receiving any MHPSS service (WHO service-coverage numerator).", compute: people("mental") },
  { key: "mental:psychosocial_sessions", area: "mental", label: "Number of psychosocial intervention sessions conducted", definition: "Counselling, psychoeducation, peer and family sessions.", compute: svc("mental", /counsel|psychoeducation|peer|family|caregiver/) },
  { key: "mental:medication_reviews", area: "mental", label: "Number of medication reviews / pharmacological care sessions", definition: "Medication reviews and mhGAP clinical reviews.", compute: svc("mental", /medication|clinical review/) },
  { key: "mental:symptoms_improved", area: "mental", label: "Number of persons with improved symptoms", definition: "Follow-ups recording symptom improvement.", compute: svc("mental", undefined, /improved/) },
  { key: "mental:adherent_medication", area: "mental", label: "Number of persons adherent to medication", definition: "Follow-ups recording medication adherence.", compute: svc("mental", undefined, /^adherent/) },
  { key: "mental:suicide_risk_identified", area: "mental", label: "Number of persons with self-harm/suicide risk identified", definition: "Suicide-risk assessments identifying risk needing urgent action.", compute: svc("mental", undefined, /suicide risk/) },
  { key: "mental:specialist_referrals", area: "mental", label: "Number of persons referred to specialist mental health care", definition: "Referrals to psychiatric/specialist services.", compute: (r) => refs("mental")(r) + svc("mental", /specialist/)(r) },

  // ---------- WASH (WHO/UNICEF JMP) ----------
  { key: "wash:households_assessed", area: "wash", label: "Number of persons/households assessed for WASH", definition: "Unique persons with a WASH check.", compute: people("wash") },
  { key: "wash:basic_water_access", area: "wash", label: "Number of households with safe (basic) drinking water", definition: "Checks finding an improved, accessible drinking-water source (JMP basic).", compute: svc("wash", undefined, /safe water available|water point functional/) },
  { key: "wash:no_safe_water", area: "wash", label: "Number of households without safe drinking water", definition: "Checks finding no safe water access.", compute: svc("wash", undefined, /no safe water|non-functional/) },
  { key: "wash:accessible_sanitation", area: "wash", label: "Number of households with accessible sanitation", definition: "Accessible latrine in use (JMP basic sanitation, disability-inclusive).", compute: svc("wash", undefined, /accessible latrine in use|adaptation completed/) },
  { key: "wash:latrine_adaptations", area: "wash", label: "Number of accessible latrine adaptations completed", definition: "Latrine adaptations delivered.", compute: svc("wash", /latrine adaptation/) },
  { key: "wash:handwashing_facilities", area: "wash", label: "Number of handwashing stations provided", definition: "Handwashing facilities with soap and water provided (JMP basic hygiene).", compute: svc("wash", /handwashing/) },
  { key: "wash:hygiene_promotion", area: "wash", label: "Number of hygiene promotion sessions conducted", definition: "Hygiene promotion including menstrual hygiene support.", compute: svc("wash", /hygiene/) },
  { key: "wash:water_points_checked", area: "wash", label: "Number of water point functionality checks conducted", definition: "Water point functionality checks done.", compute: svc("wash", /water point|water access/) },

  // ---------- Livelihood / economic empowerment ----------
  { key: "livelihood:vulnerability_assessed", area: "livelihood", label: "Number of livelihood vulnerability assessments completed", definition: "Livelihood vulnerability assessments completed.", compute: (r) => r.livelihood.length + svc("livelihood", /vulnerability assessment/)(r) },
  { key: "livelihood:high_priority", area: "livelihood", label: "Number of beneficiaries assessed as high-priority (most vulnerable)", definition: "Assessments placed in the high-priority band.", compute: (r) => r.livelihood.filter((l) => /high|critical/.test(t(l.priority_band))).length + svc("livelihood", undefined, /high priority/)(r) },
  { key: "livelihood:approved_support", area: "livelihood", label: "Number of beneficiaries approved for livelihood support", definition: "Assessments with an approved support decision.", compute: (r) => r.livelihood.filter((l) => /approv|eligible|support/.test(t(l.decision))).length + svc("livelihood", undefined, /approved for support/)(r) },
  { key: "livelihood:ground_verified", area: "livelihood", label: "Number of ground verifications completed", definition: "Ground verifications completed.", compute: svc("livelihood", /verification/) },
  { key: "livelihood:skills_trained", area: "livelihood", label: "Number of persons completing skills training", definition: "Skills and financial-literacy trainings completed.", compute: svc("livelihood", /training/, /complet/) },
  { key: "livelihood:inputs_received", area: "livelihood", label: "Number of beneficiaries receiving inputs/start-up kits", definition: "Poultry inputs, start-up kits or cash grants received.", compute: svc("livelihood", /input|kit|grant|cash/) },
  { key: "livelihood:vsla_members", area: "livelihood", label: "Number of savings group (VSLA) enrolments", definition: "Persons joining a savings group.", compute: (r) => svc("livelihood", /vsla|savings/)(r) },
  { key: "livelihood:businesses_active", area: "livelihood", label: "Number of businesses active / generating income", definition: "Monitoring visits recording an active business.", compute: svc("livelihood", undefined, /business (started|active)/) },
  { key: "livelihood:income_increased", area: "livelihood", label: "Number of beneficiaries reporting increased income", definition: "Monitoring visits recording increased income.", compute: svc("livelihood", undefined, /income increased/) },

  // ---------- Health system / continuity of care ----------
  { key: "hs:referrals_completed", area: "health_system", label: "Number of referrals completed (all components)", definition: "Referrals accepted and with a recorded outcome.", compute: (r) => r.referrals.filter((x) => /complet|accept/.test(t(x.status))).length + svc("health_system", undefined, /referral completed/)(r) },
  { key: "hs:home_visits_done", area: "health_system", label: "Number of home visits completed (LTFU tracing)", definition: "Follow-up home visits carried out.", compute: (r) => r.visits.filter((v) => /done|complet|visited/.test(t(v.status))).length + svc("health_system", /home visit/)(r) },
  { key: "hs:ltfu_traced_found", area: "health_system", label: "Number of lost-to-follow-up beneficiaries traced and found", definition: "Home visits where the beneficiary was found.", compute: (r) => r.visits.filter((v) => v.found_at_home).length + svc("health_system", /home visit/, /found at home/)(r) },
  { key: "hs:supervision_visits", area: "health_system", label: "Number of facility supportive supervision visits", definition: "Supportive supervision visits to facilities.", compute: svc("health_system", /supervision/) },
  { key: "hs:health_workers_trained", area: "health_system", label: "Number of health workers trained", definition: "Health worker training sessions delivered.", compute: svc("health_system", /training/) },
  { key: "hs:stock_outs_found", area: "health_system", label: "Number of commodity stock-outs found", definition: "Supply checks finding a stock-out.", compute: svc("health_system", undefined, /stock-?out/) },
];

export const INDICATOR_AREA_LABEL: Record<IndicatorArea, string> = {
  core: "Core programme", ntd: "NTDs / MMDP", eye: "Eye health", mental: "Mental health (mhGAP)",
  wash: "WASH", livelihood: "Livelihood", health_system: "Health system & continuity",
};

/** Area each server programme setting covers (null/"all" = everything). */
export const indicatorAllowed = (area: IndicatorArea, serverArea?: string | null) =>
  !serverArea || serverArea === "all" || area === "core" || area === "health_system" || area === serverArea;

export const computeNationalIndicators = (rows: IndicatorRows, serverArea?: string | null) =>
  NATIONAL_INDICATORS.filter((i) => indicatorAllowed(i.area, serverArea)).map((i) => ({ indicator_key: i.key, value: i.compute(rows) }));
