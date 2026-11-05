// Planning heatmaps: per-State points for Accessibility, Security clearance,
// Terrain and Population density. Points use the corrected GPS (override →
// community → settlement) and are kept only when they fall inside the
// recorded State's boundary, so no community is drawn in the wrong place.

export type HeatTheme = "accessibility" | "security" | "terrain" | "population";

export interface HeatEntry {
  state?: string | null; lga?: string | null; ward?: string | null; community_name?: string | null;
  accessibility?: string | null; security_clearance?: string | null; terrain_type?: string | null;
  estimated_total_population?: number | null; number_of_households?: number | null;
  community_latitude?: number | null; community_longitude?: number | null;
  community_lat_override?: number | null; community_lng_override?: number | null;
  settlement_latitude?: number | null; settlement_longitude?: number | null;
}

export interface Category { key: string; label: string; color: string; weight: number }

// WHO-style palette: WHO blue, green, amber, orange, red, neutral grey.
export const WHO = { blue: "#009ADE", navy: "#0B3C5D", green: "#3A9A3F", amber: "#F2A900", orange: "#E8702A", red: "#C8102E", grey: "#8A9BA8", teal: "#00A6A6", brown: "#8C6D46", olive: "#7A8B2E" };

export const THEMES: Record<HeatTheme, { title: string; field: keyof HeatEntry | null; categories: Category[]; heatNote: string }> = {
  accessibility: {
    title: "Accessibility", field: "accessibility", heatNote: "Heat = concentration of hard-to-reach communities",
    categories: [
      { key: "accessible", label: "Accessible", color: WHO.green, weight: 0.1 },
      { key: "seasonal", label: "Seasonal", color: WHO.amber, weight: 0.5 },
      { key: "hard_to_reach", label: "Hard to reach", color: WHO.orange, weight: 0.8 },
      { key: "inaccessible", label: "Inaccessible", color: WHO.red, weight: 1 },
      { key: "unset", label: "Not recorded", color: WHO.grey, weight: 0 },
    ],
  },
  security: {
    title: "Security clearance", field: "security_clearance", heatNote: "Heat = concentration of insecure communities",
    categories: [
      { key: "cleared", label: "Cleared", color: WHO.green, weight: 0.1 },
      { key: "partial", label: "Partially cleared", color: WHO.amber, weight: 0.6 },
      { key: "not_cleared", label: "Not cleared", color: WHO.red, weight: 1 },
      { key: "unknown", label: "Unknown", color: WHO.grey, weight: 0.35 },
    ],
  },
  terrain: {
    title: "Terrain types", field: "terrain_type", heatNote: "Heat = concentration of difficult terrain",
    categories: [
      { key: "flat", label: "Flat", color: WHO.olive, weight: 0.1 },
      { key: "desert", label: "Desert", color: WHO.amber, weight: 0.5 },
      { key: "hilly", label: "Hilly", color: WHO.brown, weight: 0.6 },
      { key: "forest", label: "Forest", color: WHO.green, weight: 0.7 },
      { key: "riverine", label: "Riverine", color: WHO.blue, weight: 0.8 },
      { key: "swampy", label: "Swampy", color: WHO.teal, weight: 0.9 },
      { key: "mountainous", label: "Mountainous", color: WHO.red, weight: 1 },
      { key: "unset", label: "Not recorded", color: WHO.grey, weight: 0 },
    ],
  },
  population: {
    title: "Population density", field: null, heatNote: "Heat = population weight per community",
    categories: [
      { key: "p1", label: "< 500", color: "#BFE3F5", weight: 0.15 },
      { key: "p2", label: "500 – 1,999", color: "#5BBDE8", weight: 0.35 },
      { key: "p3", label: "2,000 – 4,999", color: WHO.blue, weight: 0.6 },
      { key: "p4", label: "5,000 – 9,999", color: WHO.orange, weight: 0.85 },
      { key: "p5", label: "10,000+", color: WHO.red, weight: 1 },
    ],
  },
};

export const HEAT_GRADIENT = { 0.15: "#BFE3F5", 0.35: "#009ADE", 0.6: "#F2A900", 0.8: "#E8702A", 1: "#C8102E" };

const num = (v: unknown) => (v == null || v === "" ? NaN : Number(v));
const inNigeria = (lat: number, lng: number) => lat >= 4 && lat <= 14 && lng >= 2.6 && lng <= 14.8;

/** Best available GPS for a community: manual correction first, then community, then settlement. */
export function entryPoint(e: HeatEntry): [number, number] | null {
  const pairs: [unknown, unknown][] = [
    [e.community_lat_override, e.community_lng_override],
    [e.community_latitude, e.community_longitude],
    [e.settlement_latitude, e.settlement_longitude],
  ];
  for (const [a, b] of pairs) {
    const lat = num(a), lng = num(b);
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) && inNigeria(lat, lng)) return [lat, lng];
  }
  return null;
}

export function populationBand(pop: number): string {
  return pop >= 10000 ? "p5" : pop >= 5000 ? "p4" : pop >= 2000 ? "p3" : pop >= 500 ? "p2" : "p1";
}

export function categoryOf(e: HeatEntry, theme: HeatTheme): Category {
  const t = THEMES[theme];
  if (theme === "population") return t.categories.find((c) => c.key === populationBand(Number(e.estimated_total_population) || 0))!;
  let raw = String(e[t.field!] ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (theme === "security" && !raw) raw = "unknown";
  return t.categories.find((c) => c.key === raw) ?? t.categories.find((c) => c.key === "unset" || c.key === "unknown")!;
}

type Ring = number[][];
type Geom = { type: string; coordinates: unknown };
function ringContains(ring: Ring, lng: number, lat: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function geometryContains(g: Geom, lat: number, lng: number): boolean {
  const polys = g.type === "Polygon" ? [g.coordinates as Ring[]] : g.type === "MultiPolygon" ? (g.coordinates as Ring[][]) : [];
  return polys.some((rings) => rings.length > 0 && ringContains(rings[0], lng, lat) && !rings.slice(1).some((h) => ringContains(h, lng, lat)));
}

export const normState = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase().replace(/\s+STATE$/, "").replace(/^FCT$|^ABUJA$|FEDERAL CAPITAL TERRITORY/, "FCT");

export interface StatePoint { lat: number; lng: number; entry: HeatEntry }
export interface StateGroup { state: string; points: StatePoint[]; outside: number; noGps: number }

/** Group entries by recorded State; keep only GPS points inside that State's LGA polygons. */
export function groupByState(entries: HeatEntry[], lgaFeatures: { properties: { state: string }; geometry: Geom }[]): StateGroup[] {
  const byState = new Map<string, Geom[]>();
  for (const f of lgaFeatures) { const k = normState(f.properties.state); (byState.get(k) ?? byState.set(k, []).get(k)!).push(f.geometry); }
  const groups = new Map<string, StateGroup>();
  for (const e of entries) {
    if (!e.state) continue;
    const key = normState(e.state);
    const g = groups.get(key) ?? groups.set(key, { state: String(e.state).trim(), points: [], outside: 0, noGps: 0 }).get(key)!;
    const p = entryPoint(e);
    if (!p) { g.noGps++; continue; }
    const shapes = byState.get(key);
    if (shapes && !shapes.some((s) => geometryContains(s, p[0], p[1]))) { g.outside++; continue; }
    g.points.push({ lat: p[0], lng: p[1], entry: e });
  }
  return [...groups.values()].filter((g) => g.points.length || g.noGps || g.outside).sort((a, b) => b.points.length - a.points.length);
}
