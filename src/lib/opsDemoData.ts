// ─── Operations Dashboard demo-data generator ────────────────────────────────
// Produces a fully-populated, realistic synthetic dataset for the NTD Operations
// tab across all 36 states + the FCT. Used only by the Owner / Super Admins for
// simulation. It mirrors the exact community-level shape the live dashboard
// derives from Microplanning + Community Treatment Summary + Coverage Evaluation
// (CES) + MDA Supervisory Checklist, applying the same WHO / Nigeria NTD proxy
// definitions for target populations and programme thresholds.
//
// Proxy / target-population definitions (WHO + Nigeria NTD Programme):
//   • Trachoma            → entire community population            (target ≥ 80%)
//   • SCH / STH           → children 5–14 years (school-age, SAC)  (target ≥ 75%)
//   • LF / Onchocerciasis → children 5–14 + adults 15+ (excl. <5)  (target ≥ 65%)

import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";

export interface DemoCommunity {
  key: string; state: string; lga: string; ward: string; community: string;
  lat: number | null; lng: number | null;
  microPresent: boolean; targetPop: number;
  microTreated: number; microHH: number; microHHTreated: number;
  microTherap: number | null; microGeo: number | null;
  cesElig: number; cesTreatedPersons: number; cesHHVisited: number; cesHHTreated: number;
  cesSegHH: number; cesSegTreated: number;
  cesTherap: number | null; cesGeo: number | null; cesValidated: boolean; cesVisits: number;
  mdaPresent: boolean; mdaEligible: number; mdaTreated: number; mdaHHVisited: number; mdaHHTreated: number;
  mdaTherap: number | null; mdaGeo: number | null;
  ctsPresent: boolean; ctsTreated: number; ctsElig: number; ctsHHTotal: number; ctsHHTreated: number;
  ctsTherap: number | null; ctsGeo: number | null;
  trTreated: number; trTarget: number; ssTreated: number; ssTarget: number; lfTreated: number; lfTarget: number;
  summaryTherap: number | null; summaryGeo: number | null;
}

export interface OpsDemoData {
  communities: DemoCommunity[];
  ctsRows: { createdAt: string }[];
  mdaRows: { createdAt: string }[];
  generatedAt: string;
}

// Deterministic, seedable PRNG (mulberry32) → stable demo every run.
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TARGET_TOTAL_COMMUNITIES = 64958; // mirrors the national microplanned figure

// Nigeria bounding box for scattering supervision-gap markers.
const NG = { latMin: 4.3, latMax: 13.5, lngMin: 3.0, lngMax: 14.6 };

export function generateOpsDemoData(seed = 20250512): OpsDemoData {
  const rand = mulberry32(seed);
  const between = (a: number, b: number) => a + (b - a) * rand();
  const clampPct = (v: number) => Math.max(0, Math.min(100, v));

  const states = getAllStates();
  // Build the full LGA list (state, lga, wards).
  const lgaUnits: { state: string; lga: string; wards: string[] }[] = [];
  states.forEach((st) => {
    getLGAsForState(st).forEach((lga) => {
      const wards = getWardsForLGA(st, lga);
      lgaUnits.push({ state: st, lga, wards: wards.length ? wards : ["Ward 1"] });
    });
  });
  const totalLgas = lgaUnits.length || 1;
  const perLga = Math.max(8, Math.round(TARGET_TOTAL_COMMUNITIES / totalLgas));

  const communities: DemoCommunity[] = [];
  const ctsRows: { createdAt: string }[] = [];
  const mdaRows: { createdAt: string }[] = [];
  const monthIso = "2025-05-15T10:00:00.000Z";

  let globalIdx = 0;
  lgaUnits.forEach((unit) => {
    // Per-LGA "data quality" factor → drives source agreement (concordance).
    // ~30% of LGAs are well-aligned (small spread), the rest disagree more.
    const aligned = rand() < 0.3;
    const noise = aligned ? between(2, 7) : between(10, 26); // pp spread between sources
    // Per-LGA underlying therapeutic & geographic performance.
    const baseT = clampPct(between(58, 92));
    const baseG = clampPct(between(60, 94));

    for (let i = 0; i < perLga; i++) {
      globalIdx++;
      const ward = unit.wards[Math.floor(rand() * unit.wards.length)] || "Ward 1";
      const community = `${unit.lga} Community ${i + 1}`;

      const targetPop = Math.round(between(700, 4200));
      const children514 = Math.round(targetPop * between(0.26, 0.34));
      const adults15 = Math.round(targetPop * between(0.42, 0.52));

      // Three independent source readings around the LGA baseline.
      const jitter = () => (rand() - 0.5) * 2 * noise;
      const summaryT = clampPct(baseT + jitter());
      const cesT = clampPct(baseT + jitter());
      const mdaT = clampPct(baseT + jitter());
      const summaryG = clampPct(baseG + jitter());
      const cesG = clampPct(baseG + jitter());
      const mdaG = clampPct(baseG + jitter());

      // Coverage / reporting completeness flags (drive KPIs & gap map).
      const microPresent = true;
      const ctsPresent = rand() < 0.78;        // % with treatment data reported
      const mdaSupervised = rand() < 0.887;    // % communities visited (MDA supervision)
      const cesPresent = rand() < 0.34;        // CES is a sampled survey
      const cesValidated = cesPresent && rand() < 0.62;

      // Microplan (planned/reported) figures.
      const microTreated = Math.round(targetPop * (summaryT / 100));
      const microHH = Math.round(targetPop / between(4.2, 6.1));
      const microHHTreated = Math.round(microHH * (summaryG / 100));

      // Community Treatment Summary (Level 1) — disease-specific per proxy rules.
      const trTarget = ctsPresent ? targetPop : 0;
      const ssTarget = ctsPresent ? children514 : 0;
      const lfTarget = ctsPresent ? children514 + adults15 : 0;
      const trTreated = Math.round(trTarget * (clampPct(baseT + jitter()) / 100));
      const ssTreated = Math.round(ssTarget * (clampPct(baseT + jitter()) / 100));
      const lfTreated = Math.round(lfTarget * (clampPct(baseT + jitter()) / 100));
      const ctsElig = ctsPresent ? targetPop : 0;
      const ctsTreated = ctsPresent ? Math.round(ctsElig * (summaryT / 100)) : 0;
      const ctsHHTotal = ctsPresent ? microHH : 0;
      const ctsHHTreated = ctsPresent ? Math.round(ctsHHTotal * (summaryG / 100)) : 0;

      // CES (measured) figures.
      const cesElig = cesPresent ? Math.round(targetPop * between(0.08, 0.18)) : 0;
      const cesTreatedPersons = cesPresent ? Math.round(cesElig * (cesT / 100)) : 0;
      const cesHHVisited = cesPresent ? Math.round(cesElig / between(4, 6)) : 0;
      const cesHHTreated = cesPresent ? Math.round(cesHHVisited * (cesG / 100)) : 0;

      // MDA Supervisory Checklist (verified) figures.
      const mdaEligible = mdaSupervised ? Math.round(targetPop * between(0.1, 0.25)) : 0;
      const mdaTreated = mdaSupervised ? Math.round(mdaEligible * (mdaT / 100)) : 0;
      const mdaHHVisited = mdaSupervised ? Math.round(mdaEligible / between(4, 6)) : 0;
      const mdaHHTreated = mdaSupervised ? Math.round(mdaHHVisited * (mdaG / 100)) : 0;

      // Scatter ~400 markers for the supervision-gap map (avoid overloading Leaflet).
      const withCoords = globalIdx % 160 === 0;
      const lat = withCoords ? +between(NG.latMin, NG.latMax).toFixed(4) : null;
      const lng = withCoords ? +between(NG.lngMin, NG.lngMax).toFixed(4) : null;

      const ctsTherap = ctsPresent ? summaryT : null;
      communities.push({
        key: `${unit.state}|${unit.lga}|${ward}|${community}`.toLowerCase(),
        state: unit.state, lga: unit.lga, ward, community, lat, lng,
        microPresent, targetPop,
        microTreated, microHH, microHHTreated, microTherap: summaryT, microGeo: summaryG,
        cesElig, cesTreatedPersons, cesHHVisited, cesHHTreated,
        cesSegHH: cesHHVisited, cesSegTreated: cesHHTreated,
        cesTherap: cesPresent ? cesT : null, cesGeo: cesPresent ? cesG : null, cesValidated, cesVisits: cesHHVisited,
        mdaPresent: mdaSupervised, mdaEligible, mdaTreated, mdaHHVisited, mdaHHTreated,
        mdaTherap: mdaSupervised ? mdaT : null, mdaGeo: mdaSupervised ? mdaG : null,
        ctsPresent, ctsTreated, ctsElig, ctsHHTotal, ctsHHTreated,
        ctsTherap, ctsGeo: ctsPresent ? summaryG : null,
        trTreated, trTarget, ssTreated, ssTarget, lfTreated, lfTarget,
        // Third triangulation source = CTS where present, else microplan (Coverage tab proxy).
        summaryTherap: ctsPresent ? summaryT : summaryT,
        summaryGeo: ctsPresent ? summaryG : summaryG,
      });

      if (ctsPresent) ctsRows.push({ createdAt: monthIso });
      if (mdaSupervised) mdaRows.push({ createdAt: monthIso });
    }
  });

  return { communities, ctsRows, mdaRows, generatedAt: new Date().toLocaleString() };
}
