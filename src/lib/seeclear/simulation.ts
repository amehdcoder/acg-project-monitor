// Owner-only simulation for the See Clear Eye Health Facility Monitoring dashboard.
// Generates a realistic synthetic dataset matching the shape returned by
// useSeeClearDashboard so the Owner can preview the full dashboard exactly as it
// would look with real field monitoring — no backend writes, no AI credits,
// deterministic per seed.

import type { MonitoringRow } from "@/hooks/useSeeClearDashboard";
import { EQUIPMENT_ITEMS, type EquipStatus } from "@/lib/seeclear/definition";

// Plateau State LGAs with approximate coordinates so points land on the map.
const LGAS: { lga: string; lat: number; lng: number }[] = [
  { lga: "Jos North", lat: 9.9285, lng: 8.8921 },
  { lga: "Jos South", lat: 9.8154, lng: 8.8583 },
  { lga: "Jos East", lat: 9.9667, lng: 9.05 },
  { lga: "Barkin Ladi", lat: 9.5363, lng: 8.9 },
  { lga: "Bassa", lat: 10.0833, lng: 8.7333 },
  { lga: "Bokkos", lat: 9.3, lng: 9.0 },
  { lga: "Mangu", lat: 9.5167, lng: 9.1 },
  { lga: "Pankshin", lat: 9.3333, lng: 9.4333 },
  { lga: "Kanam", lat: 9.3, lng: 9.65 },
  { lga: "Kanke", lat: 9.3, lng: 9.45 },
  { lga: "Langtang North", lat: 9.1333, lng: 9.7833 },
  { lga: "Langtang South", lat: 8.9, lng: 9.7 },
  { lga: "Mikang", lat: 8.95, lng: 9.55 },
  { lga: "Qua'an Pan", lat: 8.8, lng: 9.45 },
  { lga: "Riyom", lat: 9.6167, lng: 8.75 },
  { lga: "Shendam", lat: 8.8833, lng: 9.5333 },
  { lga: "Wase", lat: 9.1, lng: 9.95 },
];

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

const pick = <T,>(rng: () => number, arr: T[]) => arr[Math.floor(rng() * arr.length)];

export interface SeeClearSimDataset {
  rows: MonitoringRow[];
}

const FACILITY_SUFFIX = ["PHC", "General Hospital", "Health Centre", "Cottage Hospital", "Clinic", "Comprehensive HC"];

/** Generate a synthetic See Clear facility monitoring dataset (~186 facilities). */
export function generateSeeClearSimulation(seed = 5125): SeeClearSimDataset {
  const rng = makeRng(seed);
  const rows: MonitoringRow[] = [];

  const target = 186;
  let idx = 0;
  while (rows.length < target) {
    for (const place of LGAS) {
      if (rows.length >= target) break;
      idx++;
      // Level distribution ~ Primary 61%, Secondary 29%, Tertiary 9%.
      const lr = rng();
      const level = lr < 0.61 ? "primary" : lr < 0.9 ? "secondary" : "tertiary";
      // Ownership ~ 68% government.
      const ownership = rng() < 0.68 ? "government" : "private";

      // Readiness driven by level (higher levels score better) + noise.
      const base = level === "tertiary" ? 80 : level === "secondary" ? 70 : 64;
      const readiness = Math.max(22, Math.min(98, Math.round(base + (rng() - 0.45) * 40)));

      const is_functional = readiness >= 45 && rng() > 0.1;
      const essential_supplies = rng() < 0.71;
      const complete_records = rng() < 0.634;
      const referral_compliance = rng() < 0.786;

      const referrals_made = 2 + Math.floor(rng() * 18);
      const referrals_completed = Math.round(referrals_made * (0.6 + rng() * 0.35));

      // Equipment statuses weighted by readiness.
      const equipment: Record<string, EquipStatus> = {};
      EQUIPMENT_ITEMS.forEach((it) => {
        const advanced = it.group === "advanced";
        if (advanced && level === "primary") {
          equipment[it.key] = "na";
          return;
        }
        const r = rng();
        const goodChance = readiness / 130;
        if (r < goodChance) equipment[it.key] = "func";
        else if (r < goodChance + 0.18) equipment[it.key] = "nonfunc";
        else equipment[it.key] = "unavailable";
      });

      // Common gaps for low scorers.
      const gapPool = [
        "No VA Charts, Tonometer not functional",
        "No Autorefractor, poor records",
        "Slit lamp not functional, stockouts",
        "Referral documentation incomplete",
        "No measuring tape, stock management",
        "Stock-out of eye drops",
      ];
      const critical_gap = readiness < 65 ? pick(rng, gapPool) : "";

      const challengesPool = ["Staff shortage", "Stock-out of eye drops", "Referral delays", "Non-functional equipment", "Poor record keeping"];
      const recsPool = ["Recruit more eye care staff", "Improve drugs supply", "Strengthen referrals", "Repair / replace equipment"];
      const challenges = challengesPool.filter(() => rng() < 0.35);
      const recommendations = recsPool.filter(() => rng() < 0.4);

      const r = rng();
      const status = r < 0.78 ? "sent" : r < 0.9 ? "finalized" : "draft";

      const lat = place.lat + (rng() - 0.5) * 0.18;
      const lng = place.lng + (rng() - 0.5) * 0.18;

      rows.push({
        id: `sim-sc-${idx}`,
        monitor_id: `sim-monitor-${1 + (idx % 6)}`,
        date_of_visit: daysAgo(idx % 50).slice(0, 10),
        state: "Plateau",
        lga: place.lga,
        ward: `${place.lga} Ward ${1 + (idx % 5)}`,
        community: `${place.lga} Community ${1 + (idx % 8)}`,
        facility_name: `${place.lga} ${pick(rng, FACILITY_SUFFIX)}`,
        facility_level: level,
        ownership,
        is_functional,
        essential_supplies,
        complete_records,
        referral_compliance,
        referrals_made,
        referrals_completed,
        readiness_score: readiness,
        equipment,
        challenges,
        recommendations,
        critical_gap,
        gps_lat: lat,
        gps_lng: lng,
        status,
        created_at: (() => { const d = new Date(); d.setDate(d.getDate() - (idx % 50)); d.setHours(8 + (idx % 6), (idx * 7) % 60, 0, 0); return d.toISOString(); })(),
        updated_at: (() => { const d = new Date(); d.setDate(d.getDate() - (idx % 50)); d.setHours(8 + (idx % 6), (idx * 7) % 60, 0, 0); d.setMinutes(d.getMinutes() + 45 + Math.floor(rng() * 120)); return d.toISOString(); })(),
      });
    }
  }

  return { rows: rows.slice(0, target) };
}
