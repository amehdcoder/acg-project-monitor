// Predictive loss-to-follow-up and surgical default risk scoring.
//
// A logistic model scored entirely on the device, so a supervisor can triage a
// whole facility register with no connection. The weights below are the
// programme's operating assumptions from routine NTD and eye-health follow-up
// practice; they are transparent on purpose — every score comes with the
// reasons that produced it, so a CHEW coordinator can argue with it.
//
// Features
//   • attendance history   — how reliably the person attended past visits and
//                            how long their visit intervals have stretched
//   • appointment pressure — how close (or overdue) the next appointment is
//   • distance             — straight-line kilometres from home to the treating
//                            facility
//   • demographics         — age band and sex, plus surgical-pathway status
//   • engagement           — time since the very last contact of any kind
//
// The score is a probability of missing the next appointment. Anything at or
// above the "high" band is proposed for a CHEW home visit before the date.

export interface RiskInput {
  beneficiaryId: string;
  name: string;
  caseId: string;
  /** ISO dates of every recorded contact (services, referrals), any order. */
  visitDates: string[];
  /** Next scheduled appointment, if any. */
  nextFollowUp?: string | null;
  /** Beneficiary home coordinates. */
  lat?: number | null;
  lng?: number | null;
  /** Treating facility coordinates. */
  facilityLat?: number | null;
  facilityLng?: number | null;
  age?: number | null;
  sex?: string | null;
  /** True when the person is on a surgical pathway (TT surgery, hydrocoelectomy). */
  surgical?: boolean;
  /** Record status — exited / on hold changes the meaning of a gap. */
  status?: string | null;
}

export type RiskBand = "low" | "moderate" | "high" | "very_high";

export interface RiskResult {
  beneficiaryId: string;
  name: string;
  caseId: string;
  /** 0–100. */
  score: number;
  band: RiskBand;
  reasons: string[];
  /** Straight-line kilometres home → facility, when both are known. */
  distanceKm: number | null;
  /** Mean gap between past visits, in days. */
  meanIntervalDays: number | null;
  /** Days until the next appointment; negative when already overdue. */
  daysToAppointment: number | null;
  /** What the programme should do next. */
  recommendation: string;
}

export const RISK_BANDS: { value: RiskBand; label: string; tone: "success" | "warning" | "danger" | "neutral" }[] = [
  { value: "low", label: "Low", tone: "success" },
  { value: "moderate", label: "Moderate", tone: "neutral" },
  { value: "high", label: "High", tone: "warning" },
  { value: "very_high", label: "Very high", tone: "danger" },
];

export const bandLabel = (b: RiskBand) => RISK_BANDS.find((x) => x.value === b)?.label || b;
export const bandTone = (b: RiskBand) => RISK_BANDS.find((x) => x.value === b)?.tone || "neutral";

const R_EARTH_KM = 6371;

/** Great-circle distance between two coordinates, in kilometres. */
export const haversineKm = (
  aLat: number, aLng: number, bLat: number, bLng: number,
): number => {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
};

const days = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 86_400_000;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * Scores one beneficiary's probability of missing their next appointment.
 */
export const scoreLtfuRisk = (input: RiskInput, now = new Date()): RiskResult => {
  const reasons: string[] = [];

  const dates = [...new Set(input.visitDates.filter(Boolean))]
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  // --- attendance rhythm ------------------------------------------------
  let meanIntervalDays: number | null = null;
  let intervalDrift = 0;
  if (dates.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i += 1) gaps.push(days(dates[i - 1], dates[i]));
    meanIntervalDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    // Drift: is the most recent gap much longer than the person's own average?
    const last = gaps[gaps.length - 1];
    intervalDrift = meanIntervalDays > 0 ? (last - meanIntervalDays) / meanIntervalDays : 0;
    if (intervalDrift > 0.5) {
      reasons.push(`Visits are getting further apart — last gap ${Math.round(last)} days against an average of ${meanIntervalDays}.`);
    }
  }

  const daysSinceLastVisit = dates.length ? Math.round(days(dates[dates.length - 1], now)) : null;
  if (daysSinceLastVisit != null && daysSinceLastVisit > 120) {
    reasons.push(`No contact for ${daysSinceLastVisit} days.`);
  }

  // --- appointment pressure --------------------------------------------
  let daysToAppointment: number | null = null;
  if (input.nextFollowUp) {
    const d = new Date(input.nextFollowUp);
    if (!Number.isNaN(d.getTime())) daysToAppointment = Math.round(days(now, d));
  }
  if (daysToAppointment != null && daysToAppointment < 0) {
    reasons.push(`Appointment overdue by ${Math.abs(daysToAppointment)} days.`);
  } else if (daysToAppointment != null && daysToAppointment <= 7) {
    reasons.push(`Appointment due in ${daysToAppointment} day${daysToAppointment === 1 ? "" : "s"}.`);
  } else if (daysToAppointment == null) {
    reasons.push("No follow-up appointment scheduled.");
  }

  // --- distance ---------------------------------------------------------
  let distanceKm: number | null = null;
  if (input.lat != null && input.lng != null && input.facilityLat != null && input.facilityLng != null) {
    distanceKm = +haversineKm(input.lat, input.lng, input.facilityLat, input.facilityLng).toFixed(1);
    if (distanceKm >= 15) reasons.push(`Lives ${distanceKm} km from the treating facility.`);
  }

  // --- demographics -----------------------------------------------------
  const age = Number(input.age);
  if (Number.isFinite(age)) {
    if (age >= 65) reasons.push("Older adult — travel and escort are common barriers.");
    else if (age > 0 && age < 5) reasons.push("Young child — attendance depends entirely on a carer.");
  }
  if (input.surgical) reasons.push("On a surgical pathway — post-operative review must not be missed.");

  // --- logistic model ---------------------------------------------------
  // Intercept tuned so a well-attending, nearby adult with a scheduled
  // appointment lands in the low band.
  let z = -2.1;
  z += Math.min(1.8, Math.max(0, (daysSinceLastVisit ?? 60) / 120)) * 1.25;
  z += Math.min(1.5, Math.max(0, intervalDrift)) * 0.9;
  if (daysToAppointment == null) z += 0.85;
  else if (daysToAppointment < 0) z += Math.min(1.6, 0.6 + Math.abs(daysToAppointment) / 30);
  else if (daysToAppointment <= 7) z += 0.35;
  else z -= 0.25;
  if (distanceKm != null) z += Math.min(1.2, distanceKm / 25);
  else z += 0.15; // unknown location is itself a tracing risk
  if (Number.isFinite(age)) {
    if (age >= 65) z += 0.45;
    else if (age > 0 && age < 5) z += 0.35;
    else if (age >= 15 && age < 35) z += 0.2;
  }
  if ((input.sex || "").toLowerCase().startsWith("f")) z += 0.12;
  if (input.surgical) z += 0.4;
  if (dates.length <= 1) z += 0.5;
  if ((input.status || "").toLowerCase() === "on_hold") z += 0.3;

  const p = sigmoid(z);
  const score = Math.round(p * 100);
  const band: RiskBand = score >= 75 ? "very_high" : score >= 55 ? "high" : score >= 35 ? "moderate" : "low";

  if (!reasons.length) reasons.push("Attending regularly, close to the facility and booked in.");

  const recommendation =
    band === "very_high"
      ? "Dispatch a CHEW home visit now — trace, counsel and re-book before the date."
      : band === "high"
        ? "Schedule a CHEW home visit before the appointment."
        : band === "moderate"
          ? "Send a reminder call or SMS a week ahead."
          : "No action needed — keep the routine reminder.";

  return {
    beneficiaryId: input.beneficiaryId,
    name: input.name,
    caseId: input.caseId,
    score,
    band,
    reasons,
    distanceKm,
    meanIntervalDays,
    daysToAppointment,
    recommendation,
  };
};

/** Scores a whole register and returns it highest-risk first. */
export const rankLtfuRisk = (inputs: RiskInput[], now = new Date()): RiskResult[] =>
  inputs.map((i) => scoreLtfuRisk(i, now)).sort((a, b) => b.score - a.score);
