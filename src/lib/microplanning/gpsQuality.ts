import { geometryContains, normState } from "./heatmaps";
import type { AdminBoundary } from "./nigeriaAdminBoundaries";

/**
 * GPS data-quality audit: tests every recorded community, settlement and FLHF
 * point against official OCHA/OSGOF LGA polygons and explains results in plain
 * English. Pure and deterministic so the figures can be tested.
 */
export interface GpsQualityEntry {
  id: string; state?: string | null; lga?: string | null; ward?: string | null;
  community_name?: string | null; settlement_name?: string | null; flhf_name?: string | null;
  community_latitude?: number | null; community_longitude?: number | null;
  settlement_latitude?: number | null; settlement_longitude?: number | null;
  flhf_latitude?: number | null; flhf_longitude?: number | null;
}
export type GpsStatus = "inside" | "border" | "near_border" | "swapped" | "other_lga" | "other_state" | "outside_nigeria" | "unknown_lga";
export type PointKind = "community" | "settlement" | "flhf";
export interface GpsFinding {
  entryId: string; kind: PointKind; name: string; state: string; lga: string; ward: string;
  lat: number; lng: number; status: GpsStatus; foundState: string | null; foundLga: string | null; kmFromLga: number | null;
}
export interface GpsCluster { lat: number; lng: number; count: number; lgas: string[]; foundLga: string | null }
export interface GpsQualityReport {
  total: number; missing: number; counts: Record<GpsStatus, number>;
  findings: GpsFinding[]; clusters: GpsCluster[]; insights: { tone: "good" | "warn" | "bad"; text: string }[];
  score: number;
}

const ALIASES: Record<string, string> = { garunmalam: "garummallam", garunmallam: "garummallam", nassarawa: "nasarawa", municipal: "kanomunicipal", kanocity: "kanomunicipal" };
export const normLga = (s: string | null | undefined) => {
  const k = String(s ?? "").toLowerCase().replace(/local government( area)?|\blga\b/g, "").replace(/[^a-z]/g, "");
  return ALIASES[k] ?? k;
};
const valid = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

type Ring = [number, number][];
function rings(g: AdminBoundary["geometry"]): Ring[] {
  return g.type === "Polygon" ? (g.coordinates as Ring[]) : (g.coordinates as Ring[][]).flat();
}
/** Approximate km from a point to a polygon's edges (equirectangular, fine for < 100 km). */
export function kmToPolygon(g: AdminBoundary["geometry"], lat: number, lng: number): number {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57;
  let best = Infinity;
  for (const r of rings(g)) for (let i = 1; i < r.length; i++) {
    const ax = (r[i - 1][0] - lng) * kx, ay = (r[i - 1][1] - lat) * ky, bx = (r[i][0] - lng) * kx, by = (r[i][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export const BORDER_KM = 1, NEAR_BORDER_KM = 5, CLUSTER_MIN = 5;

export function analyseGpsQuality(entries: readonly GpsQualityEntry[], lgas: readonly AdminBoundary[]): GpsQualityReport {
  const locate = (lat: number, lng: number) => lgas.find((f) => geometryContains(f.geometry as never, lat, lng)) ?? null;
  const counts: Record<GpsStatus, number> = { inside: 0, border: 0, near_border: 0, swapped: 0, other_lga: 0, other_state: 0, outside_nigeria: 0, unknown_lga: 0 };
  const findings: GpsFinding[] = []; let missing = 0;
  const seen = new Set<string>();
  const clusterMap = new Map<string, { lat: number; lng: number; count: number; lgas: Set<string>; foundLga: string | null }>();
  for (const e of entries) {
    const st = String(e.state ?? ""), lga = String(e.lga ?? "");
    const declared = lgas.find((f) => normState(f.properties.state) === normState(st) && normLga(f.properties.lga) === normLga(lga)) ?? null;
    const pts: [PointKind, unknown, unknown, string][] = [
      ["community", e.community_latitude, e.community_longitude, e.community_name ?? ""],
      ["settlement", e.settlement_latitude, e.settlement_longitude, e.settlement_name ?? ""],
      ["flhf", e.flhf_latitude, e.flhf_longitude, e.flhf_name ?? ""],
    ];
    for (const [kind, la, ln, name] of pts) {
      if (kind === "settlement" && !e.settlement_name && la == null) continue;
      if (kind === "flhf" && !e.flhf_name && la == null) continue;
      if (!valid(la, ln)) { if (kind !== "flhf") missing++; continue; }
      const lat = la as number, lng = ln as number;
      // One place recorded on several rows (FLHF, parent/settlement copies) is counted once.
      const dedupe = `${kind === "flhf" ? "f" : "c"}|${name.trim().toLowerCase()}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
      if (seen.has(dedupe)) continue; seen.add(dedupe);
      const found = locate(lat, lng);
      const inState = !!found && normState(found.properties.state) === normState(st);
      const inLga = inState && normLga(found!.properties.lga) === normLga(lga);
      let status: GpsStatus; let km: number | null = null;
      if (inLga) status = "inside";
      else {
        km = declared ? Math.round(kmToPolygon(declared.geometry, lat, lng) * 100) / 100 : null;
        const swap = valid(lng, lat) ? locate(lng, lat) : null;
        if (swap && normState(swap.properties.state) === normState(st) && (!declared || normLga(swap.properties.lga) === normLga(lga))) status = "swapped";
        else if (!declared && inState) status = "unknown_lga";
        else if (km != null && km < BORDER_KM) status = "border";
        else if (!found) status = "outside_nigeria";
        else if (!inState) status = "other_state";
        else if (km != null && km < NEAR_BORDER_KM) status = "near_border";
        else status = "other_lga";
      }
      counts[status]++;
      if (status !== "inside") findings.push({ entryId: e.id, kind, name: name || "(unnamed)", state: st, lga, ward: String(e.ward ?? ""), lat, lng, status, foundState: found?.properties.state ?? null, foundLga: found?.properties.lga ?? null, kmFromLga: km });
      if (kind !== "flhf") {
        const key = `${lat.toFixed(4)}|${lng.toFixed(4)}`;
        const c = clusterMap.get(key) ?? clusterMap.set(key, { lat, lng, count: 0, lgas: new Set(), foundLga: found?.properties.lga ?? null }).get(key)!;
        c.count++; c.lgas.add(lga);
      }
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const clusters = [...clusterMap.values()].filter((c) => c.count >= CLUSTER_MIN)
    .map((c) => ({ lat: c.lat, lng: c.lng, count: c.count, lgas: [...c.lgas].sort(), foundLga: c.foundLga })).sort((a, b) => b.count - a.count);
  const accepted = counts.inside + counts.border + counts.near_border;
  const score = total ? Math.round((accepted / total) * 1000) / 10 : 0;
  return { total, missing, counts, findings, clusters, insights: buildInsights(counts, total, missing, findings, clusters), score };
}

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "0%");
const pl = (n: number, w: string) => `${n.toLocaleString()} ${n === 1 ? w : w === "community/settlement" ? "communities/settlements" : w + "s"}`;

function topGroup(f: GpsFinding[], status: GpsStatus) {
  const m = new Map<string, number>();
  for (const x of f) if (x.status === status) { const k = `${x.lga} → ${x.foundLga ?? "outside Nigeria"}${x.foundState && normState(x.foundState) !== normState(x.state) ? `, ${x.foundState}` : ""}`; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
}

export function buildInsights(c: Record<GpsStatus, number>, total: number, missing: number, f: GpsFinding[], clusters: GpsCluster[]) {
  const out: { tone: "good" | "warn" | "bad"; text: string }[] = [];
  if (!total) { out.push({ tone: "warn", text: missing ? `No usable GPS yet: ${pl(missing, "community/settlement")} have no coordinates.` : "No GPS points recorded for this project yet." }); return out; }
  out.push({ tone: c.inside / total >= 0.9 ? "good" : c.inside / total >= 0.75 ? "warn" : "bad", text: `${pl(c.inside, "GPS point")} of ${total.toLocaleString()} (${pct(c.inside, total)}) fall inside the LGA recorded for them.` });
  if (c.border + c.near_border) out.push({ tone: "good", text: `${pl(c.border + c.near_border, "point")} sit just across an LGA line (${c.border.toLocaleString()} within 1 km, ${c.near_border.toLocaleString()} within 1–5 km). This is normal GPS and boundary precision, so they are accepted.` });
  if (c.swapped) out.push({ tone: "bad", text: `${pl(c.swapped, "point")} have latitude and longitude typed the wrong way round — swapped back, they land inside the recorded LGA. Correct them in the form or KoboToolbox.` });
  if (c.other_lga) { const g = topGroup(f, "other_lga"); out.push({ tone: "bad", text: `${pl(c.other_lga, "point")} were captured more than 5 km inside a different LGA of the same State${g.length ? ` (mostly ${g.map(([k, n]) => `${k}: ${n}`).join("; ")})` : ""}. Re-capture on site.` }); }
  if (c.other_state) { const g = topGroup(f, "other_state"); out.push({ tone: "bad", text: `${pl(c.other_state, "point")} were captured in another State${g.length ? ` (${g.map(([k, n]) => `${k}: ${n}`).join("; ")})` : ""}. These are real capture errors, not map drawing problems.` }); }
  if (c.outside_nigeria) out.push({ tone: "bad", text: `${pl(c.outside_nigeria, "point")} fall outside Nigeria entirely — usually a device without a GPS fix or a typing error.` });
  if (c.unknown_lga) out.push({ tone: "warn", text: `${pl(c.unknown_lga, "point")} use an LGA name that doesn't match the official list, so only the State could be checked.` });
  for (const cl of clusters.slice(0, 3)) out.push({ tone: "warn", text: `${cl.count} communities/settlements (${cl.lgas.join(", ")}) share one spot at ${cl.lat.toFixed(4)}, ${cl.lng.toFixed(4)}${cl.foundLga ? ` in ${cl.foundLga}` : ""}. GPS was probably taken at a base or office rather than in each community.` });
  if (missing) out.push({ tone: "warn", text: `${pl(missing, "community/settlement")} have no usable GPS at all.` });
  return out;
}
