import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip } from "react-leaflet";
import type { Layer } from "leaflet";
import "leaflet/dist/leaflet.css";
import { loadNigeriaGeo, lgaKey } from "@/components/Dashboard/ops/lgaGeo";
import { readinessBand, BMZ_GREEN, BMZ_DARK } from "@/lib/bmz/definition";

interface LgaAgg {
  visits: number;
  compSum: number;
  compCount: number;
}

interface Props {
  lgaData: { name: string; count: number; compliance: number }[];
  points?: { lat: number; lng: number; name: string; color: string; band: string }[];
}

// Colour scale for visit intensity (choropleth)
function visitColor(v: number, max: number): string {
  if (v === 0) return "#e2e8f0";
  const t = Math.min(1, v / Math.max(1, max));
  // green ramp: pale mint -> deep BMZ green
  const stops = ["#dcfce7", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#0f6b52"];
  const idx = Math.min(stops.length - 1, Math.floor(t * stops.length));
  return stops[idx];
}

export default function JigawaLgaMap({ lgaData, points = [] }: Props) {
  const [geo, setGeo] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    loadNigeriaGeo()
      .then((data) => {
        if (!alive) return;
        // Filter to Jigawa
        const jigawa = {
          type: "FeatureCollection",
          features: data.features.filter(
            (f: any) => String(f?.properties?.state || "").toLowerCase() === "jigawa",
          ),
        };
        setGeo(jigawa);
      })
      .catch(() => setGeo(null));
    return () => {
      alive = false;
    };
  }, []);

  const lgaMap = useMemo(() => {
    const m = new Map<string, { visits: number; compliance: number }>();
    lgaData.forEach((l) => {
      m.set(lgaKey("Jigawa", l.name), { visits: l.count, compliance: l.compliance });
    });
    return m;
  }, [lgaData]);

  const maxVisits = useMemo(
    () => Math.max(1, ...lgaData.map((l) => l.count)),
    [lgaData],
  );

  const style = (feature: any) => {
    const key = lgaKey(feature.properties.state, feature.properties.lga);
    const rec = lgaMap.get(key);
    const visits = rec?.visits ?? 0;
    return {
      color: BMZ_DARK,
      weight: 1.4,
      fillColor: visitColor(visits, maxVisits),
      fillOpacity: 0.82,
    };
  };

  const onEachFeature = (feature: any, layer: Layer) => {
    const key = lgaKey(feature.properties.state, feature.properties.lga);
    const rec = lgaMap.get(key);
    const visits = rec?.visits ?? 0;
    const comp = rec?.compliance ?? 0;
    const band = visits > 0 ? readinessBand(comp).label : "No data";
    const bandColor = visits > 0 ? readinessBand(comp).color : "#94a3b8";
    (layer as any).bindTooltip(
      `<div style="font-family:system-ui;font-size:12px;line-height:1.35">
        <div style="font-weight:700;color:${BMZ_DARK}">${feature.properties.lga} LGA</div>
        <div>Visits: <b>${visits}</b></div>
        <div>Avg compliance: <b>${visits > 0 ? comp + "%" : "—"}</b></div>
        <div>Band: <b style="color:${bandColor}">${band}</b></div>
      </div>`,
      { sticky: true, direction: "top", opacity: 0.95 },
    );
  };

  if (!geo) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl bg-[#eef2f0] text-sm text-muted-foreground">
        Loading Jigawa State boundaries…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#d3e4dc] shadow-sm">
      <MapContainer
        center={[12.4, 9.75]}
        zoom={8}
        style={{ height: 380, width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        <GeoJSON data={geo} style={style as any} onEachFeature={onEachFeature} />
        {points.map((p, i) => (
          <CircleMarker
            key={i}
            center={[p.lat, p.lng]}
            radius={5}
            pathOptions={{ color: "#111", weight: 1, fillColor: p.color, fillOpacity: 0.9 }}
          >
            <Tooltip>
              <div style={{ fontSize: 12 }}>
                <b>{p.name}</b>
                <div>{p.band}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 bg-white px-3 py-2 text-[11px] text-[#0b3d2e]">
        <span className="font-bold uppercase tracking-wide">Visit intensity</span>
        {["#e2e8f0", "#dcfce7", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#0f6b52"].map((c, i) => (
          <span key={c} className="inline-flex items-center gap-1">
            <span className="h-3 w-5 rounded-sm" style={{ background: c }} />
            {i === 0 ? "0" : i === 6 ? `≥ ${maxVisits}` : ""}
          </span>
        ))}
        <span className="mx-2 h-4 w-px bg-[#d3e4dc]" />
        <span className="font-bold uppercase tracking-wide" style={{ color: BMZ_GREEN }}>
          Dots = visit compliance band
        </span>
      </div>
    </div>
  );
}
