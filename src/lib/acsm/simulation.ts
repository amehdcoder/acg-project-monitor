// Owner/Admin simulation for the ACSM Advocacy Dashboard. Generates a realistic
// synthetic dataset matching the shape returned by useAcsmDashboard so the full
// dashboard can be previewed exactly as it would look with real reporting —
// no backend writes, no AI credits, deterministic per seed.

import type { AcsmRow } from "@/hooks/useAcsmDashboard";
import {
  ACSM_INDICATORS, ACSM_CATEGORIES, type AcsmCategory,
  computeAchievement, statusFromAchievement,
} from "@/lib/acsm/definition";

const LOCATIONS: { lga: string; lat: number; lng: number }[] = [
  { lga: "Barkin Ladi", lat: 9.5363, lng: 8.9 },
  { lga: "Jos North", lat: 9.9285, lng: 8.8921 },
  { lga: "Bassa", lat: 10.0833, lng: 8.7333 },
  { lga: "Riyom", lat: 9.6167, lng: 8.75 },
  { lga: "Mangu", lat: 9.5167, lng: 9.1 },
  { lga: "Jos South", lat: 9.8154, lng: 8.8583 },
  { lga: "Bokkos", lat: 9.3, lng: 9.0 },
  { lga: "Pankshin", lat: 9.3333, lng: 9.4333 },
  { lga: "Shendam", lat: 8.8833, lng: 9.5333 },
  { lga: "Wase", lat: 9.1, lng: 9.95 },
];

const OFFICERS = ["Grace Jonathan", "Daniel Bot", "Mary Audu", "Peter Gyang", "Esther Dung", "Samuel Pam"];

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

const pick = <T,>(rng: () => number, arr: T[]) => arr[Math.floor(rng() * arr.length)];
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

export interface AcsmSimDataset {
  rows: AcsmRow[];
}

/** Generate a synthetic ACSM dataset (~24 indicator reports across modules). */
export function generateAcsmSimulation(seed = 7012): AcsmSimDataset {
  const rng = makeRng(seed);
  const rows: AcsmRow[] = [];
  let n = 0;

  (Object.keys(ACSM_INDICATORS) as AcsmCategory[]).forEach((cat) => {
    ACSM_INDICATORS[cat].forEach((ind) => {
      // 2-3 location-specific reports per indicator
      const reps = 2 + Math.floor(rng() * 2);
      for (let r = 0; r < reps; r++) {
        const loc = pick(rng, LOCATIONS);
        const isMoney = ind.unit === "amount_ngn";
        const isPct = ind.unit === "percentage";
        const target = isMoney
          ? (5 + Math.floor(rng() * 20)) * 10_000_000
          : isPct
          ? 100
          : 50 + Math.floor(rng() * 400);
        // Achievement leaning toward realistic spread
        const ratio = 0.35 + rng() * 0.75;
        const actual = Math.round(target * ratio);
        const pct = computeAchievement(target, isPct ? actual : actual > target ? target * (0.8 + rng() * 0.4) : actual);
        const achievement = isPct ? actual : computeAchievement(target, actual);
        const status = statusFromAchievement(achievement);
        const female = Math.round((30 + rng() * 60) * 10);
        const male = Math.round(female * (0.6 + rng() * 0.5));
        const total = female + male;
        const u18 = Math.round(total * 0.15);
        const a3 = Math.round(total * 0.37);
        const mid = total - u18 - a3;
        n++;
        rows.push({
          id: `sim-${n}`,
          reporting_period: "May 2025",
          reporting_level: "lga",
          state: "Plateau",
          lga: loc.lga,
          ward: null,
          community: null,
          category: cat,
          indicator: ind.value,
          indicator_level: ind.level,
          unit_of_measure: ind.unit,
          target_value: target,
          actual_achieved: actual,
          achievement_pct: achievement,
          status,
          responsible_officer: pick(rng, OFFICERS),
          data_source: "Activity Report",
          date_reported: daysAgo(Math.floor(rng() * 20)).slice(0, 10),
          stakeholder_type: "Community Members",
          engagement_type: "Community Outreach",
          communication_channel: "Community Meetings",
          reach_type: "direct",
          female_count: female,
          male_count: male,
          age_under18: u18,
          age_18_35: mid,
          age_35_plus: a3,
          narrative_progress: null,
          contribution_story: null,
          key_challenges: null,
          actions_next_steps: null,
          evidence: [],
          gps_lat: loc.lat + (rng() - 0.5) * 0.1,
          gps_lng: loc.lng + (rng() - 0.5) * 0.1,
          submission_status: "finalized",
          created_at: daysAgo(Math.floor(rng() * 25)),
        });
      }
    });
  });

  return { rows };
}
