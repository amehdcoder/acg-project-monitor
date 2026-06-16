// Owner/Admin simulation for the Social & Behaviour Change Dashboard. Generates
// a realistic synthetic dataset matching the shape returned by useSbcDashboard so
// the full dashboard can be previewed exactly as it would look with real
// reporting — no backend writes, no AI credits, deterministic per seed.

import type { SbcRow } from "@/hooks/useSbcDashboard";
import {
  SBC_INDICATORS, type SbcCategory,
  computeAchievement, statusFromAchievement,
} from "@/lib/sbc/definition";

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

export interface SbcSimDataset {
  rows: SbcRow[];
}

/** Generate a synthetic SBC dataset (~30 indicator reports across result areas). */
export function generateSbcSimulation(seed = 5103): SbcSimDataset {
  const rng = makeRng(seed);
  const rows: SbcRow[] = [];
  let n = 0;

  (Object.keys(SBC_INDICATORS) as SbcCategory[]).forEach((cat) => {
    SBC_INDICATORS[cat].forEach((ind) => {
      // 2-3 location-specific reports per indicator
      const reps = 2 + Math.floor(rng() * 2);
      for (let r = 0; r < reps; r++) {
        const loc = pick(rng, LOCATIONS);
        const isPct = ind.unit === "percentage";
        const target = isPct ? 100 : 50 + Math.floor(rng() * 400);
        const ratio = 0.35 + rng() * 0.75;
        const actual = isPct ? Math.round(40 + rng() * 55) : Math.round(target * ratio);
        const achievement = isPct ? actual : computeAchievement(target, actual);
        const status = statusFromAchievement(achievement);
        const female = Math.round((30 + rng() * 60) * 10);
        const male = Math.round(female * (0.6 + rng() * 0.5));
        const total = female + male;
        const u18 = Math.round(total * 0.22);
        const a3 = Math.round(total * 0.33);
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
          data_source: "KAP Survey",
          date_reported: daysAgo(Math.floor(rng() * 20)).slice(0, 10),
          stakeholder_type: "Community Members",
          engagement_type: "Interpersonal Communication",
          communication_channel: "Interpersonal Communication",
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
