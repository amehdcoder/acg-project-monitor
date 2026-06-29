import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Compass, MapPin } from "lucide-react";
import StreetViewPanel from "@/components/maps/GoogleStreetViewPanel";
import { attachStreetViewControl } from "@/lib/maps/leafletStreetViewControl";

/**
 * FCT (Abuja) Area-Council choropleth for the Integrated MDA Supervisory
 * Checklist dashboard (ENDFUND project). Renders the 6 FCT Area Councils
 * (Abaji, Bwari, Gwagwalada, Kuje, Kwali, Municipal Area Council) and populates
 * them with the GPS captured on each supervisory submission. Mirrors the Jigawa
 * map exactly: every point is assigned to the council polygon it falls inside,
 * shading the council by visit volume and dropping a marker at the captured GPS.
 */

export interface FctSubmissionLite {
  id: string;
  lga?: string | null;
  submitter?: string | null;
  submittedAt?: string | null;
  location?: { latitude?: number; longitude?: number } | null;
}

interface Props {
  submissions: FctSubmissionLite[];
  formName?: string;
}

const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// GADM truncations used in /nigeria-lga.geojson → readable Area-Council labels.
const LGA_LABEL: Record<string, string> = {
  abujamun: "Municipal Area Council",
  gwagwala: "Gwagwalada",
  abaji: "Abaji",
  bwari: "Bwari",
  kuje: "Kuje",
  kwali: "Kwali",
};

const prettyLga = (raw: string) => LGA_LABEL[norm(raw)] ?? raw;

const SATELLITE_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTRIBUTION = "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

// Ray-casting point-in-polygon, handling Polygon + MultiPolygon rings.
function pointInFeature(lat: number, lng: number, geom: any): boolean {
  if (!geom) return false;
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer) continue;
    let inside = false;
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const xi = outer[i][0], yi = outer[i][1];
      const xj = outer[j][0], yj = outer[j][1];
      const intersect =
        yi > lat !== yj > lat &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

const fillFor = (visits: number, max: number) => {
  if (visits <= 0) return "#e2e8f0";
  const t = max > 0 ? visits / max : 0;
  // light → deep teal ramp
  const stops = ["#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e"];
  return stops[Math.min(stops.length - 1, Math.round(t * (stops.length - 1)))];
};

export default function FctSupervisoryMap({ submissions, formName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [streetView, setStreetView] = useState<{ lat: number; lng: number } | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const geoRef = useRef<any[] | null>(null);
  const sweepTimer = useRef<number | null>(null);
  const liveRef = useRef<L.Marker | null>(null);

  const points = useMemo(
    () =>
      submissions
        .map((s) => {
          const lat = s.location?.latitude;
          const lng = s.location?.longitude;
          if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return { id: s.id, lat, lng, submitter: s.submitter || "—", at: s.submittedAt, lga: s.lga || null };
        })
        .filter(Boolean) as { id: string; lat: number; lng: number; submitter: string; at?: string | null; lga: string | null }[],
    [submissions],
  );

  // Load + cache FCT Area-Council polygons once.
  useEffect(() => {
    let cancelled = false;
    if (geoRef.current) return;
    fetch("/nigeria-lga.geojson")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (cancelled) return;
        geoRef.current = (d.features || []).filter(
          (f: any) => norm(f?.properties?.state) === "federalcapitalterritory",
        );
        redraw();
      })
      .catch((e) => console.warn("FCT boundaries failed", e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Init the leaflet map once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, { zoomControl: true, attributionControl: true });
    L.tileLayer(SATELLITE_TILE_URL, {
      maxZoom: 19,
      attribution: SATELLITE_ATTRIBUTION,
      crossOrigin: true,
    })
      .on("tileerror", (event) => console.warn("FCT satellite basemap tile failed", event))
      .addTo(map);
    map.setView([8.95, 7.18], 9);
    mapRef.current = map;
    const detachSv = attachStreetViewControl(map, {
      onPick: (lat, lng) => setStreetView({ lat, lng }),
    });
    setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 50);
    redraw();
    return () => {
      detachSv();
      if (sweepTimer.current) { clearInterval(sweepTimer.current); sweepTimer.current = null; }
      try { map.remove(); } catch { /* noop */ } mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw whenever data changes.
  useEffect(redraw, [points]);

  function redraw() {
    const map = mapRef.current;
    const feats = geoRef.current;
    if (!map || !feats) return;

    // Count visits per council: prefer GPS-in-polygon, fall back to typed LGA.
    const visits = new Map<string, number>();
    const assign = (key: string) => visits.set(key, (visits.get(key) || 0) + 1);
    const unmatched: typeof points = [];
    for (const p of points) {
      let matched = false;
      for (const f of feats) {
        if (pointInFeature(p.lat, p.lng, f.geometry)) {
          assign(norm(f.properties.lga));
          matched = true;
          break;
        }
      }
      if (!matched) {
        if (p.lga) assign(norm(p.lga));
        unmatched.push(p);
      }
    }
    const max = Math.max(0, ...visits.values());

    if (layerRef.current) { try { map.removeLayer(layerRef.current); } catch { /* noop */ } }
    const group = L.layerGroup();
    const bounds = L.latLngBounds([]);

    // Bold glow underlay so the FCT boundary reads strongly over the basemap.
    const glow = L.geoJSON(
      { type: "FeatureCollection", features: feats } as any,
      { style: () => ({ color: "#0d9488", weight: 6, opacity: 0.22, fill: false }) },
    );
    group.addLayer(glow);

    const gj = L.geoJSON(
      { type: "FeatureCollection", features: feats } as any,
      {
        style: (feature: any) => {
          const v = visits.get(norm(feature?.properties?.lga)) || 0;
          return { color: "#0f766e", weight: 1.8, fillColor: fillFor(v, max), fillOpacity: v > 0 ? 0.82 : 0.4 };
        },
        onEachFeature: (feature: any, lyr: L.Layer) => {
          const label = prettyLga(feature?.properties?.lga || "");
          const v = visits.get(norm(feature?.properties?.lga)) || 0;
          lyr.bindTooltip(`<strong>${label}</strong><br/>${v} supervisory visit${v === 1 ? "" : "s"}`, { sticky: true });
          (lyr as L.Path).on("mouseover", () => (lyr as L.Path).setStyle({ weight: 3.2, color: "#134e4a" }));
          (lyr as L.Path).on("mouseout", () => (lyr as L.Path).setStyle({ weight: 1.8, color: "#0f766e" }));
          try { bounds.extend((lyr as any).getBounds()); } catch { /* noop */ }
        },
      },
    );
    group.addLayer(gj);

    // GPS markers at the captured coordinates.
    for (const p of points) {
      const m = L.circleMarker([p.lat, p.lng], {
        radius: 5, color: "#fff", weight: 1.5, fillColor: "#ef4444", fillOpacity: 0.95,
      }).bindPopup(
        `<div style="font-size:12px"><strong>${p.lga ? prettyLga(p.lga) : "Captured GPS"}</strong><br/>` +
          `By: ${p.submitter}<br/>${p.at ? new Date(p.at).toLocaleString() : ""}<br/>` +
          `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>`,
      );
      group.addLayer(m);
    }

    group.addTo(map);
    layerRef.current = group;
    try { if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16] }); } catch { /* noop */ }

    // Dengue-style animated sweep that replays the supervisory visits.
    if (sweepTimer.current) { clearInterval(sweepTimer.current); sweepTimer.current = null; }
    if (liveRef.current) { try { map.removeLayer(liveRef.current); } catch { /* noop */ } liveRef.current = null; }
    if (points.length) {
      const seq = [...points].sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
      let i = 0;
      const pulse = L.marker([seq[0].lat, seq[0].lng], {
        icon: L.divIcon({ className: "hcs-live", html: '<div class="hcs-live-ring"></div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
        interactive: false, zIndexOffset: -50,
      }).addTo(map);
      liveRef.current = pulse;
      sweepTimer.current = window.setInterval(() => {
        i = (i + 1) % seq.length;
        pulse.setLatLng([seq[i].lat, seq[i].lng]);
      }, 1100);
    }
  }

  const totalGps = points.length;
  const councilsTouched = new Set(
    points.map((p) => {
      const feats = geoRef.current || [];
      const f = feats.find((ft: any) => pointInFeature(p.lat, p.lng, ft.geometry));
      return f ? norm(f.properties.lga) : p.lga ? norm(p.lga) : "";
    }).filter(Boolean),
  ).size;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-sm">
          <Compass className="h-4 w-4 text-primary" />
          FCT (Abuja) Area-Council Supervision Map
        </CardTitle>
        <CardDescription className="text-xs">
          {formName ? `${formName} — ` : ""}Area Councils shaded by supervisory visits, with each captured GPS point plotted on the map.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1"><MapPin className="h-3 w-3" />{totalGps} GPS point{totalGps === 1 ? "" : "s"}</Badge>
          <Badge variant="secondary">{councilsTouched} / 6 Area Councils covered</Badge>
        </div>
        <div ref={containerRef} className="rounded-xl overflow-hidden border border-border" style={{ height: 460, width: "100%" }} />
        {totalGps === 0 && (
          <p className="text-center text-xs text-muted-foreground">No GPS captured yet — submit checklists with location to populate the map.</p>
        )}
      </CardContent>
    </Card>
  );
}
