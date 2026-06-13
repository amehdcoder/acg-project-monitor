// Owner-only simulation for the Bloomberg School Enrolment Validation dashboard.
// Generates a large, realistic synthetic dataset that matches the shape returned
// by useBloombergDashboard (ValidationRow[] + BaselineRow[] + school count) so
// the Owner can preview the full dashboard exactly as it would look with real
// field validations — no backend writes, no AI credits, deterministic per seed.

import type { ValidationRow, BaselineRow } from "@/hooks/useBloombergDashboard";

// State capitals with real coordinates so simulated points land correctly on
// the Nigeria boundary map.
const PLACES: { state: string; lat: number; lng: number }[] = [
  { state: "Kano", lat: 12.0022, lng: 8.5919 },
  { state: "Lagos", lat: 6.5244, lng: 3.3792 },
  { state: "FCT", lat: 9.0579, lng: 7.4951 },
  { state: "Enugu", lat: 6.5244, lng: 7.5186 },
  { state: "Rivers", lat: 4.8156, lng: 7.0498 },
  { state: "Borno", lat: 11.8333, lng: 13.15 },
  { state: "Oyo", lat: 7.3775, lng: 3.947 },
  { state: "Kaduna", lat: 10.5105, lng: 7.4165 },
  { state: "Sokoto", lat: 13.0059, lng: 5.2476 },
  { state: "Cross River", lat: 4.9589, lng: 8.3269 },
  { state: "Plateau", lat: 9.8965, lng: 8.8583 },
  { state: "Anambra", lat: 6.2107, lng: 7.0747 },
  { state: "Delta", lat: 6.198, lng: 6.728 },
  { state: "Bauchi", lat: 10.3158, lng: 9.8442 },
  { state: "Ondo", lat: 7.2526, lng: 5.1931 },
  { state: "Niger", lat: 9.6139, lng: 6.5569 },
  { state: "Katsina", lat: 12.9908, lng: 7.6018 },
  { state: "Benue", lat: 7.7322, lng: 8.5391 },
  { state: "Imo", lat: 5.4836, lng: 7.0333 },
  { state: "Akwa Ibom", lat: 5.0377, lng: 7.9128 },
];

const SCHOOL_TYPES = ["Primary", "Junior Secondary", "Primary & JSS"];

// Small, fast seeded PRNG (mulberry32) so the dataset is stable per session.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

export interface BloombergSimDataset {
  validations: ValidationRow[];
  baselines: BaselineRow[];
  schoolCount: number;
}

/** Generate a synthetic Bloomberg validation dataset for dashboard preview. */
export function generateBloombergSimulation(seed = 4242): BloombergSimDataset {
  const rng = makeRng(seed);
  const validations: ValidationRow[] = [];
  const baselines: BaselineRow[] = [];

  const perState = 14; // ~280 schools across states
  let idx = 0;

  for (const place of PLACES) {
    for (let i = 0; i < perState; i++) {
      idx++;
      const key = `SIM-${place.state.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, "0")}`;
      const type = SCHOOL_TYPES[idx % SCHOOL_TYPES.length];
      const name = `${place.state} ${type === "Junior Secondary" ? "Community" : "Central"} School ${i + 1}`;

      // Baseline enrolment (LEA figures): 180 - 980 pupils.
      const baseTotal = 180 + Math.floor(rng() * 800);
      const baseMale = Math.round(baseTotal * (0.46 + rng() * 0.08));
      const baseFemale = baseTotal - baseMale;
      baselines.push({
        school_key: key,
        total_male: baseMale,
        total_female: baseFemale,
        grand_total: baseTotal,
      });

      // ~88% of schools get validated; rest stay unvalidated (no validation row).
      const validated = rng() < 0.88;
      if (!validated) continue;

      // Validated figures deviate from baseline by -28% .. +12% (typically lower).
      const variance = -0.28 + rng() * 0.4;
      const valTotal = Math.max(40, Math.round(baseTotal * (1 + variance)));
      const valMale = Math.round(valTotal * (0.46 + rng() * 0.08));
      const valFemale = valTotal - valMale;

      // ~85% finalized/sent, rest drafts.
      const r = rng();
      const status = r < 0.7 ? "sent" : r < 0.85 ? "finalized" : "draft";

      const lat = place.lat + (((idx * 13) % 10) - 5) * 0.04;
      const lng = place.lng + (((idx * 7) % 10) - 5) * 0.04;

      validations.push({
        id: `sim-bbg-${idx}`,
        school_key: key,
        school_name: name,
        school_type: type,
        state: place.state,
        lga: `${place.state} Municipal`,
        gps_lat: lat,
        gps_lng: lng,
        total_male: valMale,
        total_female: valFemale,
        grand_total: valTotal,
        status,
        submitted_at: status === "draft" ? null : daysAgo(idx % 45),
        created_at: daysAgo((idx % 45) + 1),
      });
    }
  }

  return { validations, baselines, schoolCount: baselines.length };
}
