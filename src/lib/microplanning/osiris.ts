import { categoryOf, entryPoint, geometryContains, normState, type HeatEntry } from "./heatmaps";

export interface IntelEntry extends HeatEntry { id?: string; flhf_name?: string | null; cdd_names?: string | null }
export type LegendGroup = "security" | "accessibility" | "terrain" | "cdd";
export type LegendFilters = Record<LegendGroup, string[]>;
export const emptyLegendFilters = (): LegendFilters => ({security:[], accessibility:[], terrain:[], cdd:[]});
export function cddCategory(entry: IntelEntry): string {
  const names=String(entry.cdd_names??'').split(/[,;\n/]+|\band\b/i).map(s=>s.trim().toLowerCase()).filter(s=>s&&!/^(—|-|none|nil|n\/?a|0|no cdds?|not recorded|unknown)$/.test(s));
  return names.length ? "recorded" : "unrecorded";
}
export function filterLegendPoints(points: IntelPoint[], filters: LegendFilters): IntelPoint[] {
  return points.filter(p=>(Object.keys(filters) as LegendGroup[]).every(group=>!filters[group].length||filters[group].includes(group==='cdd'?cddCategory(p.entry):categoryOf(p.entry,group).key)));
}
export interface Boundary { type: "Feature"; properties: { state: string; lga?: string }; geometry: { type: string; coordinates: unknown } }
export interface IntelEvent { id: string; lat: number; lng: number; title: string; kind: "fire" | "weather" | "event"; date: string | null; source: string | null; provider: string }
export interface IntelPoint { key: string; lat: number; lng: number; entry: IntelEntry }
export function statePoints(entries: IntelEntry[], state: string, boundaries: Boundary[]) {
  const shapes = boundaries.filter((b) => normState(b.properties.state) === normState(state));
  const points: IntelPoint[] = []; let missing = 0, outside = 0;
  for (const [i, e] of entries.entries()) {
    if (normState(e.state) !== normState(state)) continue;
    const p = entryPoint(e);
    if (!p) { missing++; continue; }
    if (!shapes.length || !shapes.some((b) => geometryContains(b.geometry, p[0], p[1]))) { outside++; continue; }
    points.push({ key: e.id ?? String(i), lat: p[0], lng: p[1], entry: e });
  }
  return { points, missing, outside };
}
export function eventsInState(events: IntelEvent[], state: string, boundaries: Boundary[]) {
  const shapes = boundaries.filter((b) => normState(b.properties.state) === normState(state));
  return events.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng) && shapes.some((b) => geometryContains(b.geometry, e.lat, e.lng)));
}
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180, dlat = (b.lat-a.lat)*rad, dlng=(b.lng-a.lng)*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function nearbyEvents(point: IntelPoint, events: IntelEvent[], km = 10) {
  return events.map((e) => ({ ...e, distance: distanceKm(point,e) })).filter((e) => e.distance<=km).sort((a,b) => a.distance-b.distance);
}
export function recordedNumber(value: unknown): number | null {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const n=Number(value); return Number.isFinite(n) && n>=0 ? n : null;
}