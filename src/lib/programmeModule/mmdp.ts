// MMDP / NTD outcome tracking — shared shapes and helpers.
//
// Everything a limb-care or hydrocoele visit captures is stored inside the
// `data` JSON of `beneficiary_services`, so no schema change is needed and the
// record stays fully configurable.

import type { BeneficiaryServiceRow } from "./types";
import type { ImageSignal, LimbMeasurement } from "./limbProgress";

export type MmdpSite = "limb" | "scrotum";

export interface MmdpVisitData {
  mmdp: true;
  visit_type: "baseline" | "outcome";
  site: MmdpSite;
  affected_side?: string;
  measurements: LimbMeasurement[];
  photo?: string | null;
  image_signal?: ImageSignal | null;
  clinical_note?: string;
  follow_up_date?: string;
  follow_up_time?: string;
  follow_up_location?: string;
}

export const LIMB_SITES = [
  { key: "limb_ankle", label: "Ankle circumference (cm)" },
  { key: "limb_calf", label: "Mid-calf circumference (cm)" },
  { key: "limb_knee", label: "Below-knee circumference (cm)" },
  { key: "limb_thigh", label: "Mid-thigh circumference (cm)" },
  { key: "limb_forearm", label: "Forearm circumference (cm)" },
];

export const SCROTUM_SITES = [
  { key: "scrotum_circumference", label: "Scrotal circumference (cm)" },
  { key: "scrotum_length", label: "Scrotal length (cm)" },
];

export const AFFECTED_SIDES = ["Left leg", "Right leg", "Both legs", "Left arm", "Right arm", "Scrotum"];

/** True when a service row carries MMDP measurement/photograph data. */
export const isMmdpVisit = (s: BeneficiaryServiceRow): boolean => {
  const d = (s.data || {}) as Record<string, unknown>;
  return d.mmdp === true || Array.isArray(d.measurements);
};

/** Visits for one beneficiary, oldest first, ready for the progress model. */
export const mmdpVisits = (services: BeneficiaryServiceRow[]) =>
  services
    .filter(isMmdpVisit)
    .slice()
    .sort((a, b) => (a.service_date < b.service_date ? -1 : 1))
    .map((s) => {
      const d = (s.data || {}) as unknown as MmdpVisitData;
      return {
        id: s.id,
        date: s.service_date,
        serviceName: s.service_name || "",
        visitType: d.visit_type || "outcome",
        site: d.site || "limb",
        photo: d.photo || null,
        imageSignal: d.image_signal || null,
        measurements: (d.measurements || []).filter((m) => Number.isFinite(m.cm) && m.cm > 0),
      };
    });
