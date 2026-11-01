import { supabase } from "@/integrations/supabase/client";
import { cachedRead } from "@/lib/programmeModule/offlineReadCache";
import type { EnvironmentalFeature } from "./environment";

export type MapFacility = { id: string; name: string; latitude: number | null; longitude: number | null; state: string | null; lga: string | null };
type WashRow = { id: string; name: string; latitude: number | null; longitude: number | null; source_type: string | null; functional_status: string | null; updated_at: string };
export const validCoordinates = (lat: unknown, lng: unknown): lat is number => typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export async function loadEnvironmentalLocations(projectId: string) {
  const read = async <T,>(table: "health_facilities" | "community_wash_sources", fields: string) => {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = table === "health_facilities"
        ? await supabase.from("health_facilities").select(fields).eq("project_id", projectId).eq("is_active",true).order("id").range(offset,offset+999)
        : await supabase.from("community_wash_sources").select(fields).eq("project_id", projectId).order("id").range(offset,offset+999);
      if (error) return { data: null, error };
      rows.push(...(data ?? []) as unknown as T[]);
      if (!data || data.length < 1000) return { data: rows, error: null };
    }
  };
  const [facilities, wash] = await Promise.all([
    cachedRead<MapFacility[]>(`eye-environment-facilities:${projectId}`, () => read<MapFacility>("health_facilities", "id,name,latitude,longitude,state,lga")),
    cachedRead<WashRow[]>(`eye-environment-wash:${projectId}`, () => read<WashRow>("community_wash_sources", "id,name,source_type,functional_status,latitude,longitude,updated_at")),
  ]);
  const washFeatures: EnvironmentalFeature[] = (wash.data ?? []).flatMap((w) => validCoordinates(w.latitude, w.longitude) ? [{
    type: "Feature", properties: { kind: "wash", name: w.name, source: "Project community WASH registry", observed_at: w.updated_at.slice(0,10), status: w.functional_status ?? "Not recorded", water_source: w.source_type ?? "Not recorded", evidence_type: "Registry updated date; not a verified field assessment" },
    geometry: { type: "Point", coordinates: [w.longitude, w.latitude] },
  }] : []);
  return { facilities: facilities.data ?? [], wash: washFeatures, washUnlocated: (wash.data?.length ?? 0) - washFeatures.length, unavailable: facilities.data === null || wash.data === null, fromCache: facilities.fromCache || wash.fromCache };
}