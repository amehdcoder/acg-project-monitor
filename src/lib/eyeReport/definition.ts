// Eye Health daily facility reporting — State Ministry of Health, Primary Eye
// Care. Mirrors the "Summary of Eye Health Screening and Other Medications"
// annual template and the "Cataract Surgery Outcome Monitoring" (CSOM) sheet.

export const EYE_REPORT_NAME = "Eye Health Daily Facility Report";
export const EYE_DASH_NAME = "Eye Health Outputs & Outcomes Dashboard";

export type MF = { m: number; f: number };
export const AGE_BANDS = [
  { key: "a0_14", label: "0–14 yrs" },
  { key: "a15_39", label: "15–39 yrs" },
  { key: "a40", label: "40+ yrs" },
] as const;
export const SURGERY_ITEMS = [
  { key: "cataract", label: "Cataract operated" },
  { key: "glaucoma", label: "Glaucoma operated" },
  { key: "minor", label: "Patients needing minor surgery" },
] as const;
export const SCREEN_ITEMS = [
  { key: "refractive", label: "Refractive error" },
  { key: "cataract", label: "Cataract" },
  { key: "glaucoma", label: "Glaucoma" },
  { key: "tt", label: "Trachomatous Trichiasis (TT)" },
  { key: "other", label: "Other eye conditions" },
] as const;
export type AgeMF = { a0_14: MF; a15_39: MF; a40: MF };
/** Item paths that carry an age-by-sex breakdown (totals are derived from it). */
export const AGE_PATHS = [
  ...SCREEN_ITEMS.map((i) => `screen.${i.key}`),
  ...SURGERY_ITEMS.map((i) => `surgery.${i.key}`),
  ...["lenses", "glasses"].flatMap((g) => ["dv", "nv", "bf"].map((l) => `${g}.${l}`)),
];
export const LENS_TYPES = [
  { key: "dv", label: "Distance (DV)" },
  { key: "nv", label: "Near (NV)" },
  { key: "bf", label: "Bifocal (BF)" },
] as const;

export interface EyeSummary {
  consult: { a0_14: MF; a15_39: MF; a40: MF };
  /** Persons with disability by age band (from WG-SS when screenings exist). */
  pwdAge: { a0_14: MF; a15_39: MF; a40: MF };
  /** Total persons with disability — always the sum of pwdAge. */
  pwd: MF;
  screen: { refractive: MF; cataract: MF; glaucoma: MF; tt: MF; other: MF };
  /** Free-text description of "Other eye conditions" screened. */
  screenOther: string;
  surgery: { cataract: MF; glaucoma: MF; minor: MF };
  /** Age-band breakdown for every screening, surgery and refraction item. */
  ages: Record<string, AgeMF>;
  lenses: { dv: MF; nv: MF; bf: MF };
  glasses: { dv: MF; nv: MF; bf: MF };
}
export type VaBand = { good: number; borderline: number; poor: number };
export interface EyeCsom {
  surgeries: number;
  biometry: number;
  iol: number;
  discharge: { presenting: VaBand; pinhole: VaBand };
  followup: { presenting: VaBand; bcva: VaBand };
}

const mf = (): MF => ({ m: 0, f: 0 });
const emptyAge = (): AgeMF => ({ a0_14: mf(), a15_39: mf(), a40: mf() });
export const ageTotal = (a: AgeMF): MF => sumMF(a.a0_14, a.a15_39, a.a40);
const va = (): VaBand => ({ good: 0, borderline: 0, poor: 0 });
export const emptySummary = (): EyeSummary => ({
  consult: { a0_14: mf(), a15_39: mf(), a40: mf() },
  pwdAge: { a0_14: mf(), a15_39: mf(), a40: mf() },
  pwd: mf(),
  screen: { refractive: mf(), cataract: mf(), glaucoma: mf(), tt: mf(), other: mf() },
  screenOther: "",
  surgery: { cataract: mf(), glaucoma: mf(), minor: mf() },
  ages: Object.fromEntries(AGE_PATHS.map((k) => [k, emptyAge()])),
  lenses: { dv: mf(), nv: mf(), bf: mf() },
  glasses: { dv: mf(), nv: mf(), bf: mf() },
});
export const emptyCsom = (): EyeCsom => ({
  surgeries: 0, biometry: 0, iol: 0,
  discharge: { presenting: va(), pinhole: va() },
  followup: { presenting: va(), bcva: va() },
});

export const sumMF = (...xs: MF[]): MF => xs.reduce((a, x) => ({ m: a.m + x.m, f: a.f + x.f }), mf());
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
/** Deep-normalises any stored/partial JSON into a full summary of integers. */
export function normSummary(raw: any): EyeSummary {
  const s = emptySummary();
  const g = (o: any): MF => ({ m: n(o?.m), f: n(o?.f) });
  for (const b of AGE_BANDS) { s.consult[b.key] = g(raw?.consult?.[b.key]); s.pwdAge[b.key] = g(raw?.pwdAge?.[b.key]); }
  // Legacy reports used 0–4 and 5–14 bands; merge them into 0–14.
  if (raw?.consult && (raw.consult.a0_4 || raw.consult.a5_14) && !raw.consult.a0_14) s.consult.a0_14 = sumMF(g(raw.consult.a0_4), g(raw.consult.a5_14));
  const byAge = sumMF(s.pwdAge.a0_14, s.pwdAge.a15_39, s.pwdAge.a40);
  s.pwd = raw?.pwdAge ? byAge : g(raw?.pwd);
  for (const i of SURGERY_ITEMS) s.surgery[i.key] = g(raw?.surgery?.[i.key]);
  for (const l of LENS_TYPES) { s.lenses[l.key] = g(raw?.lenses?.[l.key]); s.glasses[l.key] = g(raw?.glasses?.[l.key]); }
  for (const i of SCREEN_ITEMS) s.screen[i.key] = g(raw?.screen?.[i.key]);
  s.screenOther = typeof raw?.screenOther === "string" ? raw.screenOther.slice(0, 300) : "";
  // When an age breakdown is stored it is the source of truth for the item total.
  for (const path of AGE_PATHS) {
    const a = raw?.ages?.[path];
    if (!a) continue;
    const ag = { a0_14: g(a.a0_14), a15_39: g(a.a15_39), a40: g(a.a40) };
    s.ages[path] = ag;
    const [grp, key] = path.split(".");
    (s as any)[grp][key] = ageTotal(ag);
  }
  return s;
}
export function normCsom(raw: any): EyeCsom | null {
  if (!raw) return null;
  const b = (o: any): VaBand => ({ good: n(o?.good), borderline: n(o?.borderline), poor: n(o?.poor) });
  return {
    surgeries: n(raw.surgeries), biometry: n(raw.biometry), iol: n(raw.iol),
    discharge: { presenting: b(raw.discharge?.presenting), pinhole: b(raw.discharge?.pinhole) },
    followup: { presenting: b(raw.followup?.presenting), bcva: b(raw.followup?.bcva) },
  };
}

export const t = (x: MF) => x.m + x.f;
export const vaTotal = (b: VaBand) => b.good + b.borderline + b.poor;
export const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export function totals(s: EyeSummary) {
  const consulted = sumMF(s.consult.a0_14, s.consult.a15_39, s.consult.a40);
  return {
    consulted,
    lenses: sumMF(s.lenses.dv, s.lenses.nv, s.lenses.bf),
    glasses: sumMF(s.glasses.dv, s.glasses.nv, s.glasses.bf),
    surgeries: sumMF(s.surgery.cataract, s.surgery.glaucoma),
  };
}

export interface Issue { field: string; message: string; level: "error" | "warning" }
export const MAX_CELL = 5000;

/** Source-document evidence attached to a daily report. */
export interface EyeAttachment {
  ref: string; name: string; label: string; mime: string; size: number;
  kind: "image" | "video" | "audio" | "document"; pending?: boolean; captured_at: string;
}
export const normAttachments = (raw: any): EyeAttachment[] =>
  (Array.isArray(raw) ? raw : []).filter((a) => a && typeof a.ref === "string").map((a) => ({
    ref: a.ref, name: String(a.name ?? "attachment"), label: String(a.label ?? ""), mime: String(a.mime ?? ""),
    size: n(a.size), kind: (["image", "video", "audio", "document"].includes(a.kind) ? a.kind : "document") as EyeAttachment["kind"],
    pending: !!a.pending, captured_at: String(a.captured_at ?? ""),
  }));

/** One patient's Washington Group Short Set screening for a facility day. */
export interface EyePatientRow {
  id: string; project_id: string; report_id: string | null; facility_id: string | null; facility_name: string;
  state: string | null; lga: string | null; report_date: string; patient_label: string;
  sex: string | null; age_band: string | null; wg_ss: any; has_disability: boolean; disability_domains: string[];
  created_by: string | null; device_id: string | null; collector_label: string | null; created_at?: string;
}

/** Validation rules for a single daily report. Errors block saving; warnings require confirmation. */
export function validateReport(input: {
  facility: string; date: string; summary: EyeSummary; csom: EyeCsom | null; today?: string;
  state?: string; lga?: string; preparedBy?: string; confirmedBy?: string; attachments?: EyeAttachment[];
}): Issue[] {
  const out: Issue[] = [];
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  if (!input.facility.trim()) out.push({ field: "facility", message: "Select the reporting facility.", level: "error" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) out.push({ field: "date", message: "Enter the report date.", level: "error" });
  else if (input.date > today) out.push({ field: "date", message: "The report date cannot be in the future.", level: "error" });
  if (input.state !== undefined && !input.state.trim()) out.push({ field: "state", message: "Select the State.", level: "error" });
  if (input.lga !== undefined && !input.lga.trim()) out.push({ field: "lga", message: "Select the LGA.", level: "error" });
  if (input.preparedBy !== undefined && !input.preparedBy.trim()) out.push({ field: "prepared", message: "Enter who prepared this report.", level: "error" });
  if (input.confirmedBy !== undefined && !input.confirmedBy.trim()) out.push({ field: "confirmed", message: "Enter who confirmed this report (facility in-charge).", level: "error" });
  if (input.attachments !== undefined && input.attachments.length === 0)
    out.push({ field: "attachments", message: "Attach at least one photo of the source documents (register/tally sheets) these figures came from.", level: "error" });
  if (input.attachments?.some((a) => !a.label.trim()))
    out.push({ field: "attachments", message: "Give every attached source document a label (e.g. “Outpatient register p.4”).", level: "error" });

  const s = input.summary;
  const all: [string, number][] = [];
  const walk = (o: any, p: string) => { for (const [k, v] of Object.entries(o)) typeof v === "number" ? all.push([`${p}${k}`, v]) : v && typeof v === "object" ? walk(v, `${p}${k}.`) : null; };
  walk(s, "");
  for (const [k, v] of all) if (v > MAX_CELL) out.push({ field: k, message: `${v} is unusually high for one day (max ${MAX_CELL}).`, level: "error" });

  const T = totals(s);
  for (const sex of ["m", "f"] as const) {
    const label = sex === "m" ? "male" : "female";
    if (s.pwd[sex] > T.consulted[sex]) out.push({ field: `pwd.${sex}`, message: `Persons with disability (${label}) cannot exceed ${label} persons consulted (${T.consulted[sex]}).`, level: "error" });
    for (const b of AGE_BANDS) if (s.pwdAge[b.key][sex] > s.consult[b.key][sex])
      out.push({ field: `pwd.${b.key}.${sex}`, message: `Persons with disability aged ${b.label} (${label}: ${s.pwdAge[b.key][sex]}) cannot exceed ${label} persons consulted aged ${b.label} (${s.consult[b.key][sex]}).`, level: "error" });
    if (T.glasses[sex] > T.lenses[sex]) out.push({ field: `glasses.${sex}`, message: `Glasses dispensed (${label}) exceed lenses prescribed (${T.lenses[sex]}). Please confirm.`, level: "warning" });
    for (const i of SCREEN_ITEMS) if (s.screen[i.key][sex] > T.consulted[sex])
      out.push({ field: `screen.${i.key}.${sex}`, message: `${i.label} screened (${label}: ${s.screen[i.key][sex]}) cannot exceed ${label} persons consulted (${T.consulted[sex]}).`, level: "error" });
    if (T.surgeries[sex] > T.consulted[sex]) out.push({ field: `surgery.${sex}`, message: `Surgeries (${label}) are more than ${label} persons consulted today. Please confirm.`, level: "warning" });
  }
  if (t(s.screen.other) > 0 && !s.screenOther.trim()) out.push({ field: "screen.otherSpecify", message: "Specify the other eye conditions screened.", level: "error" });
  if (t(T.consulted) === 0 && all.some(([, v]) => v > 0)) out.push({ field: "consult", message: "Services are recorded but no consultations. Please confirm.", level: "warning" });

  // CSOM is a general episode (like follow-up): its own surgeries count is the
  // denominator and is independent of the day's summary surgeries.
  const c = input.csom;
  if (c) {
    const used = c.biometry + c.iol + vaTotal(c.discharge.presenting) + vaTotal(c.followup.presenting);
    if (c.surgeries === 0 && used > 0) out.push({ field: "csom.surgeries", message: "Enter the number of surgeries for this CSOM episode — it is the denominator for the percentages.", level: "error" });
    if (c.biometry > c.surgeries) out.push({ field: "csom.biometry", message: "Surgeries done after biometry cannot exceed total surgeries.", level: "error" });
    if (c.iol > c.surgeries) out.push({ field: "csom.iol", message: "Surgeries with IOL cannot exceed total surgeries.", level: "error" });
    const dp = vaTotal(c.discharge.presenting), dh = vaTotal(c.discharge.pinhole);
    if (dp > c.surgeries) out.push({ field: "csom.discharge", message: `Discharge outcomes (${dp}) cannot exceed surgeries (${c.surgeries}).`, level: "error" });
    if (dh > 0 && dh !== dp) out.push({ field: "csom.discharge.pinhole", message: `Pinhole total (${dh}) must equal presenting total (${dp}) — same eyes.`, level: "error" });
    const fp = vaTotal(c.followup.presenting), fb = vaTotal(c.followup.bcva);
    if (fb > 0 && fb !== fp) out.push({ field: "csom.followup.bcva", message: `Pinhole/BCVA total (${fb}) must equal presenting total (${fp}).`, level: "error" });
    if (c.discharge.pinhole.good > 0 && c.discharge.pinhole.good < c.discharge.presenting.good) out.push({ field: "csom.discharge.pinhole", message: "Good outcomes with pinhole are usually ≥ presenting. Please confirm.", level: "warning" });
  }
  return out;
}

export interface EyeReportRow {
  id: string; project_id: string; facility_id: string | null; facility_name: string;
  state: string | null; lga: string | null; report_date: string;
  summary: any; csom: any; notes: string | null; prepared_by: string | null; confirmed_by: string | null;
  attachments?: EyeAttachment[] | null;
  created_by: string | null; device_id: string | null; collector_label: string | null; created_at?: string;
}

/** WG-SS disability aggregation across screened patients (for the dashboard). */
export interface PatientAggregate {
  screened: number; withDisability: number; days: number; facilities: number;
  /** Disability count per WG-SS domain label (Seeing, Hearing, …). */
  domains: { label: string; count: number }[];
  bySex: { m: number; f: number; other: number };
}
export function aggregatePatients(rows: EyePatientRow[]): PatientAggregate {
  const domains = new Map<string, number>();
  const bySex = { m: 0, f: 0, other: 0 };
  let withDisability = 0;
  for (const r of rows) {
    if (r.has_disability) withDisability += 1;
    for (const d of r.disability_domains ?? []) domains.set(d, (domains.get(d) ?? 0) + 1);
    if (r.sex === "m") bySex.m += 1; else if (r.sex === "f") bySex.f += 1; else bySex.other += 1;
  }
  return {
    screened: rows.length, withDisability,
    days: new Set(rows.map((r) => r.report_date)).size,
    facilities: new Set(rows.map((r) => r.facility_name.toLowerCase())).size,
    domains: [...domains.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    bySex,
  };
}

/**
 * Cross-checks WG-SS patient screenings against a daily summary. Mismatches are
 * warnings (the clerk confirms) — screenings may legitimately be entered before
 * the summary, or cover only part of the day.
 */
export type WgScreen = { sex: string | null | ""; age_band: string | null | ""; has_disability: boolean };
/** Persons with disability by age band and sex, counted from WG-SS screenings. */
export function wgPwdByAge(rows: WgScreen[]): EyeSummary["pwdAge"] {
  const out = emptySummary().pwdAge;
  for (const r of rows) {
    if (!r.has_disability || (r.sex !== "m" && r.sex !== "f")) continue;
    const band = AGE_BANDS.find((b) => b.key === r.age_band);
    if (band) out[band.key][r.sex] += 1;
  }
  return out;
}
/** Screened patients by age band and sex. */
export function wgScreenedByAge(rows: WgScreen[]): EyeSummary["pwdAge"] {
  const out = emptySummary().pwdAge;
  for (const r of rows) { const band = AGE_BANDS.find((b) => b.key === r.age_band); if (band && (r.sex === "m" || r.sex === "f")) out[band.key][r.sex] += 1; }
  return out;
}
/** Age/sex consistency between WG-SS screenings and consultations. */
export function wgAgeIssues(rows: WgScreen[], summary: EyeSummary): Issue[] {
  const out: Issue[] = [];
  if (!rows.length || t(totals(summary).consulted) === 0) return out;
  const scr = wgScreenedByAge(rows);
  for (const b of AGE_BANDS) for (const sex of ["m", "f"] as const) {
    const label = sex === "m" ? "male" : "female"; const c = summary.consult[b.key][sex];
    if (scr[b.key][sex] > c) out.push({ field: `patients.${b.key}.${sex}`, message: `${scr[b.key][sex]} ${label} patients aged ${b.label} were screened with the WG-SS, but only ${c} were consulted in that age group. Correct the consultations or the patients' age/sex.`, level: "error" });
    else if (scr[b.key][sex] < c) out.push({ field: `patients.${b.key}.${sex}`, message: `${c} ${label} persons aged ${b.label} were consulted, but only ${scr[b.key][sex]} were screened with the WG-SS.`, level: "warning" });
  }
  return out;
}

export function wgVsSummaryIssues(patientCount: number, disabledCount: number, summary: EyeSummary): Issue[] {
  const out: Issue[] = [];
  const T = totals(summary);
  const consulted = t(T.consulted);
  if (consulted > 0 && patientCount !== consulted)
    out.push({ field: "patients", message: `${patientCount} patient${patientCount === 1 ? "" : "s"} screened with the WG-SS, but ${consulted} persons were consulted. Screen every patient or confirm the difference.`, level: "warning" });
  if (disabledCount !== t(summary.pwd))
    out.push({ field: "patients", message: `WG-SS classified ${disabledCount} patient${disabledCount === 1 ? "" : "s"} with a disability, but the summary records ${t(summary.pwd)} persons with disability. Please reconcile.`, level: "warning" });
  return out;
}

export interface Aggregate { summary: EyeSummary; csom: EyeCsom; reports: number; facilities: number; days: number }
/** Sums many daily reports into one block (used for months, years and filters). */
export function aggregate(rows: EyeReportRow[]): Aggregate {
  const s = emptySummary(); const c = emptyCsom();
  const add = (a: any, b: any) => { for (const k of Object.keys(a)) typeof a[k] === "number" ? (a[k] += b?.[k] ?? 0) : a[k] && typeof a[k] === "object" ? add(a[k], b?.[k]) : null; };
  for (const r of rows) { add(s, normSummary(r.summary)); const cs = normCsom(r.csom); if (cs) add(c, cs); }
  return { summary: s, csom: c, reports: rows.length, facilities: new Set(rows.map((r) => r.facility_name.toLowerCase())).size, days: new Set(rows.map((r) => r.report_date)).size };
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function byMonth(rows: EyeReportRow[]): Aggregate[] {
  return MONTHS.map((_, i) => aggregate(rows.filter((r) => Number(r.report_date.slice(5, 7)) === i + 1)));
}

// ── Facility name standardization ───────────────────────────────────────────

const normFacilityName = (s: string) =>
  s.toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(hosp|hp|hsp)\b/g, "hospital")
    .replace(/\b(phc|phcc)\b/g, "primary health centre")
    .replace(/\b(hc|ctr|cntr)\b/g, "centre")
    .replace(/\b(gen|govt)\b/g, (m) => (m === "gen" ? "general" : "government"))
    .replace(/\s+/g, " ")
    .trim();

const levenshtein = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
};

const tokenJaccard = (a: string, b: string): number => {
  const ta = new Set(a.split(" ").filter(Boolean)), tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
};

/**
 * Finds an existing facility name that is a likely variation of what was typed
 * (abbreviations, spelling slips, word order). Returns the canonical existing
 * name, or null when nothing is close enough — exact matches return null.
 */
export function similarFacilityName(typed: string, candidates: string[]): string | null {
  const n = normFacilityName(typed);
  if (n.length < 4) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const cn = normFacilityName(c);
    if (!cn) continue;
    const raw = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    if (raw(c) === raw(typed)) return null; // already the exact existing name
    if (cn === n) { best = c; bestScore = 1; continue; } // same name, different spelling/abbreviation
    const lev = 1 - levenshtein(n, cn) / Math.max(n.length, cn.length);
    const score = Math.max(lev, tokenJaccard(n, cn), cn.includes(n) || n.includes(cn) ? 0.85 : 0);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 0.72 ? best : null;
}
