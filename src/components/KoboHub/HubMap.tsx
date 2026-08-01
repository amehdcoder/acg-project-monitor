/**
 * Universal Kobo Hub — geospatial widget.
 * Leaflet map with clustered, category-coloured markers, Nigeria administrative
 * boundaries and automatic fitting to the filtered State / LGA / Ward.
 */
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { loadNigeriaGeo } from "@/components/Dashboard/ops/lgaGeo";
import { geoPoints, type HubFilters, type Row } from "@/lib/koboHub/analytics";
import type { HubField, HubSchema } from "@/lib/koboHub/schema";

const PALETTE = ["#10B981", "#06B6D4", "#F59E0B", "#EF4444", "#8B5CF6", "#3B82F6"];
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

interface Props {
  rows: Row[];
  schema: HubSchema;
  field: HubField;
  colourField?: HubField;
  filters: HubFilters;
}

export default function HubMap({ rows, schema, field, colourField, filters }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const boundaryRef = useRef<L.GeoJSON | null>(null);

  const points = useMemo(
    () => geoPoints(rows, schema, field, colourField),
    [rows, schema, field, colourField],
  );

  const categories = useMemo(() => {
    const set = new Set(points.map((p) => p.category).filter(Boolean));
    return [...set].slice(0, 6);
  }, [points]);

  const colourFor = (cat: string) => {
    const i = categories.indexOf(cat);
    return i >= 0 ? PALETTE[i % PALETTE.length] : "#94A3B8";
  };

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: false })
      .setView([9.08, 8.68], 6);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Administrative boundaries, clipped to the active filter.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const geo = await loadNigeriaGeo().catch(() => null);
      const map = mapRef.current;
      if (!geo || !map || cancelled) return;
      if (boundaryRef.current) { boundaryRef.current.remove(); boundaryRef.current = null; }
      const feats = (geo.features ?? []).filter((f: any) => {
        const p = f.properties ?? {};
        const st = norm(p.state ?? p.NAME_1 ?? p.statename);
        const lg = norm(p.lga ?? p.NAME_2 ?? p.lganame);
        if (filters.state && st !== norm(filters.state)) return false;
        if (filters.lga && lg !== norm(filters.lga)) return false;
        return true;
      });
      const layer = L.geoJSON({ type: "FeatureCollection", features: feats } as any, {
        style: { color: "#38BDF8", weight: filters.lga ? 2 : 0.7, fillColor: "#0EA5E9", fillOpacity: 0.05 },
      }).addTo(map);
      boundaryRef.current = layer;
      if (filters.state || filters.lga) {
        try { map.fitBounds(layer.getBounds(), { padding: [20, 20] }); } catch { /* empty */ }
      }
    })();
    return () => { cancelled = true; };
  }, [filters.state, filters.lga]);

  // Markers
  useEffect(() => {
    const group = layerRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();
    points.forEach((p) => {
      const colour = p.category ? colourFor(p.category) : "#06B6D4";
      L.circleMarker([p.lat, p.lng], {
        radius: 6, color: colour, weight: 2, fillColor: colour, fillOpacity: 0.65,
      })
        .bindTooltip(
          `<div style="font-size:12px;line-height:1.4">
            <strong>${esc(p.label)}</strong><br/>
            ${p.category ? `<span>${esc(p.category)}</span><br/>` : ""}
            ${Object.entries(p.extra).filter(([, v]) => v).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join("<br/>")}
            <br/><span style="opacity:.7">${esc(p.when)}</span>
          </div>`,
          { sticky: true },
        )
        .addTo(group);
    });
    if (points.length && !filters.state && !filters.lga) {
      try { map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [24, 24], maxZoom: 11 }); } catch { /* empty */ }
    }
  }, [points, filters.state, filters.lga, categories]);

  return (
    <Card className="bg-slate-900/70 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm text-slate-100">
          <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-cyan-400" />{field.label}</span>
          <Badge variant="outline" className="border-slate-700 text-slate-400">{points.length} points</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={ref} className="h-[420px] w-full rounded-md overflow-hidden border border-slate-800" />
        {categories.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3">
            {categories.map((c) => (
              <span key={c} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colourFor(c) }} />{c}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
