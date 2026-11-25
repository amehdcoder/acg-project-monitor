import { supabase } from "@/integrations/supabase/client";
import type { LandEvidence, ReferenceSettlement } from "./areaEvidence";

export interface CatalogueFeature extends LandEvidence { kind: "grid3" | "osm"; ref: string; state?: string | null; lga?: string | null }

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** GRID3 settlement points within `radiusKm` of the point, as catalogue features. */
export function grid3Features(refs: ReferenceSettlement[], state: string, lat: number, lng: number, radiusKm = 2): CatalogueFeature[] {
  return refs.flatMap((r) => r.latitude == null || r.longitude == null || km({ lat, lng }, { lat: r.latitude, lng: r.longitude }) > radiusKm ? [] : [{
    kind: "grid3" as const, ref: `grid3:${state}:${r.lga}:${r.name}:${r.latitude.toFixed(5)},${r.longitude.toFixed(5)}`,
    state, lga: r.lga, name: r.name, feature: "place:settlement", lat: r.latitude, lng: r.longitude, population: null, source: "GRID3 Nigeria",
  }]);
}

export function osmFeatures(evidence: LandEvidence[], state: string, lga: string): CatalogueFeature[] {
  return evidence.flatMap((e) => {
    const m = e.source.match(/openstreetmap\.org\/(node|way|relation)\/(\d+)/);
    return m ? [{ ...e, kind: "osm" as const, ref: `osm:${m[1]}/${m[2]}`, state, lga }] : [];
  });
}

/** GRID3 first; OpenStreetMap only fills gaps — OSM places within `gapKm` of a GRID3 settlement are dropped as duplicates. */
export function mergeCatalogue(grid3: CatalogueFeature[], osm: CatalogueFeature[], gapKm = 0.25): CatalogueFeature[] {
  const seen = new Set<string>(); const out: CatalogueFeature[] = [];
  for (const g of grid3) if (!seen.has(g.ref)) { seen.add(g.ref); out.push(g); }
  for (const o of osm) {
    if (seen.has(o.ref)) continue;
    if (o.feature.startsWith("place:") && grid3.some((g) => km(g, o) <= gapKm)) continue;
    seen.add(o.ref); out.push(o);
  }
  return out;
}

export async function readCatalogue(lat: number, lng: number, radiusKm = 2): Promise<CatalogueFeature[]> {
  const d = radiusKm / 111;
  const { data, error } = await supabase.from("land_features")
    .select("source_ref, source_kind, state, lga, name, feature, latitude, longitude, population, source_url")
    .gte("latitude", lat - d).lte("latitude", lat + d).gte("longitude", lng - d * 1.05).lte("longitude", lng + d * 1.05).limit(800);
  if (error) throw error;
  return (data ?? []).map((r) => ({ kind: r.source_kind as "grid3" | "osm", ref: r.source_ref, state: r.state, lga: r.lga, name: r.name, feature: r.feature,
    lat: r.latitude, lng: r.longitude, population: r.population == null ? null : Number(r.population), source: r.source_kind === "grid3" ? "GRID3 Nigeria" : (r.source_url ?? "OpenStreetMap") }))
    .filter((f) => km({ lat, lng }, f) <= radiusKm);
}

export async function saveCatalogue(features: CatalogueFeature[]) {
  for (let i = 0; i < features.length; i += 500) {
    const rows = features.slice(i, i + 500).map((f) => ({ source_ref: f.ref, source_kind: f.kind, state: f.state, lga: f.lga, name: f.name, feature: f.feature, latitude: f.lat, longitude: f.lng, population: f.population }));
    const { error } = await supabase.rpc("catalogue_land_features", { _rows: rows });
    if (error) throw error;
  }
}
