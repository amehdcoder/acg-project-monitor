// Standard Eye Health indicators aggregated from Eye Health Daily Facility Reports
// for the DHIS2 Data Exchange (push and pull). Labels follow the national
// "Number of …" wording; mappings key off the stable `key`, never the label.
// Pinhole/BCVA measurement is optional: zero means it was not used and is never
// treated as a poor result or a missing value.
// Mirror: supabase/functions/_shared/eyeIndicators.ts (keep identical).

export interface EyeIndicatorRow { summary: any; csom: any; facility_name?: string | null; report_date?: string | null }
export interface EyeIndicatorDef { key: string; label: string; definition: string; group: string }
export interface EyeAgg { [k: string]: number }

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
const mfv = (o: any) => ({ m: n(o?.m), f: n(o?.f) });

const BANDS = [["a0_14", "aged 0–14 years"], ["a15_39", "aged 15–39 years"], ["a40", "aged 40 years and above"]] as const;
const SCREEN = [["refractive", "refractive error"], ["cataract", "cataract"], ["glaucoma", "glaucoma"], ["tt", "trachomatous trichiasis (TT)"], ["other", "other eye conditions"]] as const;
const SURG = [["cataract", "cataract surgeries performed"], ["glaucoma", "glaucoma surgeries performed"], ["minor", "patients needing minor eye surgery"]] as const;
const LENS = [["dv", "distance"], ["nv", "near"], ["bf", "bifocal"]] as const;
const VA = [["good", "good (6/18 or better)"], ["borderline", "borderline (<6/18–6/60)"], ["poor", "poor (worse than 6/60)"]] as const;

const defs: EyeIndicatorDef[] = [];
const add = (key: string, label: string, definition: string, group: string, withSex = true) => {
  defs.push({ key, label, definition, group });
  if (withSex) {
    defs.push({ key: `${key}:male`, label: `${label} — male`, definition, group });
    defs.push({ key: `${key}:female`, label: `${label} — female`, definition, group });
  }
};
add("eye_daily:reports_submitted", "Number of daily eye health facility reports submitted", "Daily facility reports received for the period (reporting completeness).", "Reporting", false);
add("eye_daily:facilities_reporting", "Number of health facilities reporting eye health data", "Distinct facilities that submitted at least one daily report in the period.", "Reporting", false);
add("eye_daily:consulted", "Number of persons consulted for eye health", "Persons seen for eye consultation (all ages).", "Consultation");
for (const [b, l] of BANDS) add(`eye_daily:consulted_${b}`, `Number of persons consulted for eye health ${l}`, `Eye consultations, ${l}.`, "Consultation");
add("eye_daily:pwd_consulted", "Number of persons with disability consulted for eye health", "Persons with disability (Washington Group Short Set) seen for eye consultation.", "Consultation");
for (const [k, l] of SCREEN) add(`eye_daily:screen_${k}`, `Number of persons screened and diagnosed with ${l}`, `Persons diagnosed with ${l} at screening.`, "Screening");
for (const [k, l] of SURG) add(`eye_daily:surgery_${k}`, `Number of ${l}`, `${l[0].toUpperCase()}${l.slice(1)} in the period.`, "Surgery");
add("eye_daily:lenses_prescribed", "Number of spectacle lenses prescribed", "Refraction prescriptions issued (distance, near and bifocal).", "Refraction");
for (const [k, l] of LENS) add(`eye_daily:lenses_${k}`, `Number of ${l} lenses prescribed`, `${l[0].toUpperCase()}${l.slice(1)} lens prescriptions.`, "Refraction", false);
add("eye_daily:glasses_dispensed", "Number of spectacles dispensed", "Spectacles dispensed (distance, near and bifocal).", "Refraction");
for (const [k, l] of LENS) add(`eye_daily:glasses_${k}`, `Number of ${l} spectacles dispensed`, `${l[0].toUpperCase()}${l.slice(1)} spectacles dispensed.`, "Refraction", false);
add("eye_daily:referred_in", "Number of eye patients received on referral", "Patients received through the WHO integrated people-centred eye care referral pathway.", "Referral");
add("eye_daily:referred_out", "Number of eye patients referred for higher-level care", "Patients referred out for specialist eye care.", "Referral");
add("eye_daily:csom_surgeries", "Number of cataract surgeries monitored for outcome (CSOM)", "Cataract surgeries entered in Cataract Surgery Outcome Monitoring.", "CSOM", false);
add("eye_daily:csom_biometry", "Number of cataract surgeries performed after biometry", "CSOM surgeries preceded by biometry.", "CSOM", false);
add("eye_daily:csom_iol", "Number of cataract surgeries with intraocular lens (IOL)", "CSOM surgeries with IOL implanted.", "CSOM", false);
for (const [k, l] of VA) add(`eye_daily:discharge_presenting_${k}`, `Number of operated eyes with ${l} presenting vision at discharge`, "WHO CSOM visual outcome at discharge, presenting vision.", "CSOM", false);
for (const [k, l] of VA) add(`eye_daily:discharge_pinhole_${k}`, `Number of operated eyes with ${l} pinhole vision at discharge`, "WHO CSOM outcome with pinhole. Optional — zero means pinhole was not used.", "CSOM", false);
for (const [k, l] of VA) add(`eye_daily:followup_presenting_${k}`, `Number of operated eyes with ${l} presenting vision at follow-up`, "WHO CSOM visual outcome at ≥4-week follow-up, presenting vision.", "CSOM", false);
for (const [k, l] of VA) add(`eye_daily:followup_bcva_${k}`, `Number of operated eyes with ${l} pinhole/best-corrected vision at follow-up`, "WHO CSOM outcome with pinhole/BCVA. Optional — zero means it was not used.", "CSOM", false);

export const EYE_INDICATORS: EyeIndicatorDef[] = defs;

/** Sums daily report rows into indicator values keyed by the stable indicator key. */
export function computeEyeIndicators(rows: EyeIndicatorRow[]): { indicator_key: string; value: number }[] {
  const v: EyeAgg = Object.fromEntries(defs.map((d) => [d.key, 0]));
  const addMF = (key: string, o: any) => { const x = mfv(o); v[key] += x.m + x.f; v[`${key}:male`] += x.m; v[`${key}:female`] += x.f; };
  const facilities = new Set<string>();
  for (const r of rows) {
    const s = r.summary ?? {};
    v["eye_daily:reports_submitted"] += 1;
    if (r.facility_name) facilities.add(String(r.facility_name).trim().toLowerCase());
    const consult = { ...(s.consult ?? {}) };
    if (!consult.a0_14 && (consult.a0_4 || consult.a5_14)) consult.a0_14 = { m: n(consult.a0_4?.m) + n(consult.a5_14?.m), f: n(consult.a0_4?.f) + n(consult.a5_14?.f) };
    for (const [b] of BANDS) { addMF(`eye_daily:consulted_${b}`, consult[b]); addMF("eye_daily:consulted", consult[b]); }
    if (s.pwdAge) for (const [b] of BANDS) addMF("eye_daily:pwd_consulted", s.pwdAge[b]); else addMF("eye_daily:pwd_consulted", s.pwd);
    for (const [k] of SCREEN) addMF(`eye_daily:screen_${k}`, s.screen?.[k]);
    for (const [k] of SURG) addMF(`eye_daily:surgery_${k}`, s.surgery?.[k]);
    for (const [k] of LENS) {
      const l = mfv(s.lenses?.[k]), g = mfv(s.glasses?.[k]);
      v[`eye_daily:lenses_${k}`] += l.m + l.f; v[`eye_daily:glasses_${k}`] += g.m + g.f;
      addMF("eye_daily:lenses_prescribed", l); addMF("eye_daily:glasses_dispensed", g);
    }
    for (const o of Object.values(s.referIn ?? {})) addMF("eye_daily:referred_in", o);
    for (const o of Object.values(s.referOut ?? {})) addMF("eye_daily:referred_out", o);
    const c = r.csom;
    if (c) {
      v["eye_daily:csom_surgeries"] += n(c.surgeries); v["eye_daily:csom_biometry"] += n(c.biometry); v["eye_daily:csom_iol"] += n(c.iol);
      for (const [k] of VA) {
        v[`eye_daily:discharge_presenting_${k}`] += n(c.discharge?.presenting?.[k]);
        v[`eye_daily:discharge_pinhole_${k}`] += n(c.discharge?.pinhole?.[k]);
        v[`eye_daily:followup_presenting_${k}`] += n(c.followup?.presenting?.[k]);
        v[`eye_daily:followup_bcva_${k}`] += n(c.followup?.bcva?.[k]);
      }
    }
  }
  v["eye_daily:facilities_reporting"] = facilities.size;
  return defs.map((d) => ({ indicator_key: d.key, value: v[d.key] }));
}
