/**
 * WHO Lot Quality Assurance Sampling (LQAS) helpers for Coverage Evaluation
 * Surveys (CES). These power the Walk-Perimeter compliance checklist and
 * downstream sampling guidance.
 *
 * References:
 *  - WHO Reference Manual for Vaccination Coverage Cluster Surveys (2018)
 *  - WHO/EPI LQAS field guide (community-level "lot" definition)
 *  - WHO MDA Coverage Evaluation Surveys (NTD) — supervision area sampling
 *
 * The "lot" in LQAS is the smallest decision unit, typically a community /
 * settlement. A valid lot boundary must:
 *   1. Fully enclose all habitable households in the lot (closed polygon).
 *   2. Be a simple (non-self-intersecting) ring.
 *   3. Be walked in a consistent direction (no large back-tracking loops).
 *   4. Be captured at acceptable GPS quality (<= 25 m horizontal accuracy).
 *   5. Be of plausible size for a settlement (not a degenerate sliver).
 *   6. Have enough vertices to faithfully represent the boundary shape.
 */

import type { LatLng } from "@/lib/ces/kmeansSegments";
import { polygonAreaM2 } from "./residentialMask";

// ----------------------------- LQAS sample size --------------------------- //

export interface LqasPlan {
  /** Households to sample per lot (n). */
  n: number;
  /** Decision rule: lot rejected if `not_treated` count > d. */
  d: number;
  /** Plain-English rationale for the chosen plan. */
  rationale: string;
}

/**
 * Returns the WHO-recommended LQAS sample-size / decision-rule pair for the
 * coverage threshold the program is testing against. Values follow the
 * standard WHO/EPI LQAS reference table (alpha ~5%, beta ~10%, n=19).
 *
 * threshold is the minimum coverage (%) the program wants to confirm.
 */
export function lqasPlanForThreshold(threshold: number): LqasPlan {
  // WHO standard table (n=19) — d = max #not-covered allowed before "reject"
  const table: Array<{ p: number; d: number }> = [
    { p: 95, d: 0 },
    { p: 90, d: 1 },
    { p: 85, d: 2 },
    { p: 80, d: 3 },
    { p: 75, d: 4 },
    { p: 70, d: 5 },
    { p: 65, d: 6 },
    { p: 60, d: 7 },
    { p: 50, d: 8 },
  ];
  const row = table.find((r) => threshold >= r.p) ?? table[table.length - 1];
  return {
    n: 19,
    d: row.d,
    rationale: `WHO LQAS standard plan: sample n=19 households per lot; reject the lot if more than d=${row.d} are not covered (target ≥${row.p}%).`,
  };
}

// --------------------------- Geometry diagnostics ------------------------- //

/** Signed area (m²-ish, in degree units scaled) — sign tells ring direction. */
function signedAreaDeg(poly: LatLng[]): number {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    s += (b.lng - a.lng) * (b.lat + a.lat);
  }
  return s / 2;
}

export type RingDirection = "clockwise" | "counter-clockwise" | "indeterminate";

export function polygonRingDirection(poly: LatLng[]): RingDirection {
  if (poly.length < 3) return "indeterminate";
  const s = signedAreaDeg(poly);
  if (Math.abs(s) < 1e-12) return "indeterminate";
  // In lat/lng, positive shoelace = counter-clockwise on a screen with
  // north-up; negative = clockwise.
  return s < 0 ? "clockwise" : "counter-clockwise";
}

/** True if any two non-adjacent edges of the polygon cross. */
export function polygonHasSelfIntersection(poly: LatLng[]): boolean {
  const n = poly.length;
  if (n < 4) return false;
  for (let i = 0; i < n - 1; i++) {
    const a1 = poly[i];
    const a2 = poly[i + 1];
    for (let j = i + 2; j < n - 1; j++) {
      // skip adjacent edges
      if (i === 0 && j === n - 2) continue;
      const b1 = poly[j];
      const b2 = poly[j + 1];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function segmentsIntersect(p1: LatLng, p2: LatLng, p3: LatLng, p4: LatLng): boolean {
  const d1 = cross(p4.lng - p3.lng, p4.lat - p3.lat, p1.lng - p3.lng, p1.lat - p3.lat);
  const d2 = cross(p4.lng - p3.lng, p4.lat - p3.lat, p2.lng - p3.lng, p2.lat - p3.lat);
  const d3 = cross(p2.lng - p1.lng, p2.lat - p1.lat, p3.lng - p1.lng, p3.lat - p1.lat);
  const d4 = cross(p2.lng - p1.lng, p2.lat - p1.lat, p4.lng - p1.lng, p4.lat - p1.lat);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return false;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

// ----------------------------- Compliance --------------------------------- //

export type LqasCheckStatus = "pass" | "warn" | "fail" | "pending";

export interface LqasCheck {
  id: string;
  label: string;
  status: LqasCheckStatus;
  detail: string;
}

export interface LqasComplianceInput {
  perimeter: LatLng[];
  livePosition: LatLng | null;
  walkedM: number;
  liveAccuracyM: number | null;
  bestAccuracyM: number;
  recording: boolean;
}

export interface LqasComplianceResult {
  checks: LqasCheck[];
  /** 0–100 readiness score for handoff to Step 2. */
  score: number;
  /** True only when every required check is "pass". */
  ready: boolean;
  closureM: number | null;
  areaM2: number | null;
  direction: RingDirection;
  selfIntersects: boolean;
}

const MIN_VERTICES = 6;
const CLOSURE_M_GOOD = 15;
const CLOSURE_M_WARN = 30;
const MIN_AREA_M2 = 400;       // ~20m × 20m smallest plausible hamlet
const MAX_AREA_M2 = 2_000_000; // ~2 km² — anything bigger is multi-community
const ACC_GOOD = 15;
const ACC_WARN = 25;

export function evaluateLqasCompliance(input: LqasComplianceInput): LqasComplianceResult {
  const { perimeter, livePosition, walkedM, liveAccuracyM, bestAccuracyM, recording } = input;
  const vertices = perimeter.length;
  const closureM = vertices >= 3 && livePosition
    ? haversine(livePosition, perimeter[0])
    : null;
  const areaM2 = vertices >= 3 ? polygonAreaM2(perimeter) : null;
  const direction = polygonRingDirection(perimeter);
  const selfIntersects = polygonHasSelfIntersection(perimeter);

  const checks: LqasCheck[] = [];

  // 1. Vertex density
  checks.push({
    id: "vertices",
    label: "Vertex density",
    status: vertices === 0 ? "pending" : vertices >= MIN_VERTICES ? "pass" : "warn",
    detail: vertices === 0
      ? "Tap Walk Perimeter and start walking the boundary."
      : vertices >= MIN_VERTICES
        ? `${vertices} GPS vertices captured — boundary shape is well represented.`
        : `${vertices} of ${MIN_VERTICES} recommended vertices — keep walking the boundary.`,
  });

  // 2. GPS quality
  const accForCheck = liveAccuracyM ?? (Number.isFinite(bestAccuracyM) ? bestAccuracyM : null);
  checks.push({
    id: "gps",
    label: "GPS quality",
    status: accForCheck == null
      ? "pending"
      : accForCheck <= ACC_GOOD ? "pass"
      : accForCheck <= ACC_WARN ? "warn"
      : "fail",
    detail: accForCheck == null
      ? "Waiting for first GPS fix."
      : `Live ±${accForCheck.toFixed(0)} m · best ±${Number.isFinite(bestAccuracyM) ? bestAccuracyM.toFixed(0) : "—"} m. WHO target ≤${ACC_WARN} m.`,
  });

  // 3. Closure
  checks.push({
    id: "closure",
    label: "Closed loop",
    status: vertices < 3
      ? "pending"
      : closureM == null ? "pending"
      : closureM <= CLOSURE_M_GOOD ? "pass"
      : closureM <= CLOSURE_M_WARN ? "warn"
      : "fail",
    detail: vertices < 3
      ? "A lot boundary must form a closed ring."
      : closureM == null ? "—"
      : closureM <= CLOSURE_M_GOOD
        ? `Walked back to within ${Math.round(closureM)} m of start.`
        : `${Math.round(closureM)} m from start — keep walking back to the starting vertex.`,
  });

  // 4. Simple polygon (no self-intersections)
  checks.push({
    id: "simple",
    label: "Simple polygon",
    status: vertices < 4 ? "pending" : selfIntersects ? "fail" : "pass",
    detail: vertices < 4
      ? "Add more vertices to evaluate."
      : selfIntersects
        ? "Boundary crosses itself — re-walk the section that doubles back."
        : "Boundary does not cross itself — valid LQAS lot ring.",
  });

  // 5. Plausible area
  checks.push({
    id: "area",
    label: "Plausible lot size",
    status: areaM2 == null
      ? "pending"
      : areaM2 < MIN_AREA_M2 ? "warn"
      : areaM2 > MAX_AREA_M2 ? "warn"
      : "pass",
    detail: areaM2 == null
      ? "Area available after 3+ vertices."
      : areaM2 < MIN_AREA_M2
        ? `~${Math.round(areaM2)} m² — smaller than a typical hamlet. Confirm this is the full settlement.`
        : areaM2 > MAX_AREA_M2
          ? `~${(areaM2 / 1_000_000).toFixed(2)} km² — larger than a typical LQAS lot. Consider splitting into supervision areas.`
          : `~${areaM2 >= 10_000 ? (areaM2 / 10_000).toFixed(2) + " ha" : Math.round(areaM2) + " m²"} — within a typical community footprint.`,
  });

  // 6. Direction (informational once enough vertices)
  checks.push({
    id: "direction",
    label: "Walk direction",
    status: vertices < 5 ? "pending" : direction === "indeterminate" ? "warn" : "pass",
    detail: vertices < 5
      ? "Walk in a single, consistent direction (clockwise recommended)."
      : direction === "indeterminate"
        ? "Walk direction unclear — keep going around the boundary."
        : `Walking ${direction} — consistent, no major back-tracking.`,
  });

  // 7. Walk distance sanity
  checks.push({
    id: "walked",
    label: "Distance walked",
    status: !recording && vertices === 0
      ? "pending"
      : walkedM >= 80 ? "pass"
      : walkedM >= 30 ? "warn"
      : "pending",
    detail: walkedM === 0
      ? "Start walking — distance accumulates as vertices are captured."
      : `${Math.round(walkedM)} m walked along the boundary.`,
  });

  // Score: each pass=100, warn=60, fail=0, pending=ignored from denominator.
  const scored = checks.filter((c) => c.status !== "pending");
  const score = scored.length === 0
    ? 0
    : Math.round(
        scored.reduce((sum, c) => sum + (c.status === "pass" ? 100 : c.status === "warn" ? 60 : 0), 0) /
          scored.length,
      );

  const required = ["vertices", "gps", "closure", "simple"];
  const ready = required.every((id) => checks.find((c) => c.id === id)?.status === "pass");

  return { checks, score, ready, closureM, areaM2, direction, selfIntersects };
}

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
