import { useEffect, useRef, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Map, Eye, Layers, ZoomIn } from "lucide-react";

interface MicroplanEntry {
  id: string;
  community_name: string;
  settlement_name: string | null;
  flhf_name: string;
  state: string;
  lga: string;
  ward: string;
  community_latitude: number | null;
  community_longitude: number | null;
  settlement_latitude: number | null;
  settlement_longitude: number | null;
  flhf_latitude: number | null;
  flhf_longitude: number | null;
  estimated_total_population: number | null;
  accessibility: string | null;
  terrain_type: string | null;
  security_clearance: string | null;
  community_distance_to_flhf_km: number | null;
  settlement_distance_to_flhf_km: number | null;
  cdd_from_community: boolean | null;
  cdd_names: string | null;
}

interface MicroplanMapProps {
  entries: MicroplanEntry[];
  onEntryClick?: (id: string) => void;
}

type ThematicLayer = "distance" | "terrain" | "accessibility" | "security" | "cdd_origin";

const TERRAIN_ICONS: Record<string, { emoji: string; color: string }> = {
  flat: { emoji: "🌾", color: "#22C55E" },
  hilly: { emoji: "⛰️", color: "#A3A3A3" },
  mountainous: { emoji: "🏔️", color: "#78716C" },
  riverine: { emoji: "🌊", color: "#3B82F6" },
  swampy: { emoji: "🏝️", color: "#065F46" },
  desert: { emoji: "🏜️", color: "#D97706" },
  forest: { emoji: "🌲", color: "#15803D" },
};

const ACCESS_COLORS: Record<string, { color: string; label: string }> = {
  accessible: { color: "#10B981", label: "Accessible" },
  hard_to_reach: { color: "#F59E0B", label: "Hard to Reach" },
  inaccessible: { color: "#EF4444", label: "Inaccessible" },
  seasonal: { color: "#8B5CF6", label: "Seasonal" },
};

const SECURITY_COLORS: Record<string, { color: string; label: string }> = {
  cleared: { color: "#10B981", label: "Cleared" },
  partial: { color: "#F59E0B", label: "Partial" },
  not_cleared: { color: "#EF4444", label: "Not Cleared" },
  unknown: { color: "#6B7280", label: "Unknown" },
};

const DISTANCE_BANDS = [
  { max: 5, color: "#10B981", label: "< 5 km" },
  { max: 10, color: "#3B82F6", label: "5–10 km" },
  { max: 20, color: "#F59E0B", label: "10–20 km" },
  { max: Infinity, color: "#EF4444", label: "> 20 km" },
];

const getDistanceColor = (km: number | null) => {
  if (km == null) return "#6B7280";
  for (const b of DISTANCE_BANDS) if (km <= b.max) return b.color;
  return "#EF4444";
};

const MicroplanMap = ({ entries, onEntryClick }: MicroplanMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any>(null);
  const [activeTheme, setActiveTheme] = useState<ThematicLayer | null>(null);

  // Cascading zoom filters
  const [zoomState, setZoomState] = useState("");
  const [zoomLga, setZoomLga] = useState("");
  const [zoomWard, setZoomWard] = useState("");
  const [zoomFlhf, setZoomFlhf] = useState("");
  const [zoomCommunity, setZoomCommunity] = useState("");
  const [zoomSettlement, setZoomSettlement] = useState("");

  const cascadedEntries = useMemo(() => {
    let e = entries;
    if (zoomState) e = e.filter(x => x.state === zoomState);
    if (zoomLga) e = e.filter(x => x.lga === zoomLga);
    if (zoomWard) e = e.filter(x => x.ward === zoomWard);
    if (zoomFlhf) e = e.filter(x => x.flhf_name === zoomFlhf);
    if (zoomCommunity) e = e.filter(x => x.community_name === zoomCommunity);
    if (zoomSettlement) e = e.filter(x => x.settlement_name === zoomSettlement);
    return e;
  }, [entries, zoomState, zoomLga, zoomWard, zoomFlhf, zoomCommunity, zoomSettlement]);

  const uniqueVals = (key: keyof MicroplanEntry, src?: MicroplanEntry[]) =>
    [...new Set((src || cascadedEntries).map(e => e[key] as string).filter(Boolean))].sort();

  const stateOptions = uniqueVals("state", entries);
  const lgaOptions = uniqueVals("lga", entries.filter(e => !zoomState || e.state === zoomState));
  const wardOptions = uniqueVals("ward", entries.filter(e => (!zoomState || e.state === zoomState) && (!zoomLga || e.lga === zoomLga)));
  const flhfOptions = uniqueVals("flhf_name", entries.filter(e => (!zoomState || e.state === zoomState) && (!zoomLga || e.lga === zoomLga) && (!zoomWard || e.ward === zoomWard)));
  const communityOptions = uniqueVals("community_name", cascadedEntries);
  const settlementOptions = uniqueVals("settlement_name", cascadedEntries);

  // CDD Analytics
  const cddStats = useMemo(() => {
    const withCdd = cascadedEntries.filter(e => e.cdd_names && e.cdd_names.trim());
    const fromComm = withCdd.filter(e => e.cdd_from_community === true).length;
    const notFromComm = withCdd.filter(e => e.cdd_from_community === false).length;
    const unknown = withCdd.length - fromComm - notFromComm;
    const total = withCdd.length;
    return { fromComm, notFromComm, unknown, total, pctFrom: total ? Math.round((fromComm / total) * 100) : 0, pctNot: total ? Math.round((notFromComm / total) * 100) : 0 };
  }, [cascadedEntries]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = L.map(mapRef.current, { zoomControl: true }).setView([9.0, 8.0], 6);
    mapInstanceRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  // Render layers
  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    if (layersRef.current) { layersRef.current.clearLayers(); }
    const group = L.layerGroup().addTo(map);
    layersRef.current = group;

    const bounds: [number, number][] = [];
    const flhfDrawn = new Set<string>();

    cascadedEntries.forEach(entry => {
      const cLat = entry.community_latitude;
      const cLng = entry.community_longitude;
      const fLat = entry.flhf_latitude;
      const fLng = entry.flhf_longitude;
      const sLat = entry.settlement_latitude;
      const sLng = entry.settlement_longitude;

      // Determine marker color based on active theme
      let markerColor = "#3B82F6";
      let markerEmoji = "";
      if (activeTheme === "distance") {
        markerColor = getDistanceColor(entry.community_distance_to_flhf_km);
      } else if (activeTheme === "accessibility" && entry.accessibility) {
        markerColor = ACCESS_COLORS[entry.accessibility]?.color || "#3B82F6";
      } else if (activeTheme === "security" && entry.security_clearance) {
        markerColor = SECURITY_COLORS[entry.security_clearance]?.color || "#6B7280";
      } else if (activeTheme === "terrain" && entry.terrain_type) {
        markerColor = TERRAIN_ICONS[entry.terrain_type]?.color || "#3B82F6";
        markerEmoji = TERRAIN_ICONS[entry.terrain_type]?.emoji || "";
      } else if (activeTheme === "cdd_origin") {
        markerColor = entry.cdd_from_community === true ? "#10B981" : entry.cdd_from_community === false ? "#EF4444" : "#6B7280";
      }

      const radius = entry.estimated_total_population
        ? Math.max(6, Math.min(20, Math.sqrt(entry.estimated_total_population) / 5))
        : 8;

      // Community marker
      if (cLat && cLng) {
        if (activeTheme === "terrain" && markerEmoji) {
          const icon = L.divIcon({
            className: "microplan-terrain-icon",
            html: `<div style="font-size:18px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">${markerEmoji}</div>`,
            iconSize: [24, 24], iconAnchor: [12, 12],
          });
          L.marker([cLat, cLng], { icon }).addTo(group).bindPopup(buildPopup(entry, "community"));
        } else {
          L.circleMarker([cLat, cLng], {
            radius, fillColor: markerColor, color: "#fff", weight: 2, fillOpacity: 0.85,
          }).addTo(group).bindPopup(buildPopup(entry, "community"));
        }
        if (onEntryClick) {
          // attach click to last added layer
        }
        bounds.push([cLat, cLng]);

        // Distance line to FLHF
        if (fLat && fLng) {
          const distKm = entry.community_distance_to_flhf_km;
          const lineColor = activeTheme === "distance" ? getDistanceColor(distKm) : "#94A3B8";
          const line = L.polyline([[cLat, cLng], [fLat, fLng]], {
            color: lineColor, weight: activeTheme === "distance" ? 2.5 : 1.5,
            dashArray: activeTheme === "distance" ? undefined : "4 4",
            opacity: activeTheme === "distance" ? 0.9 : 0.5,
          }).addTo(group);

          // Distance label at midpoint
          if (distKm != null) {
            const midLat = (cLat + fLat) / 2;
            const midLng = (cLng + fLng) / 2;
            const labelIcon = L.divIcon({
              className: "distance-label",
              html: `<div style="background:${lineColor};color:#fff;font-size:10px;padding:1px 5px;border-radius:8px;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3)">${distKm} km</div>`,
              iconSize: [50, 16], iconAnchor: [25, 8],
            });
            L.marker([midLat, midLng], { icon: labelIcon, interactive: false }).addTo(group);
          }
        }
      }

      // FLHF marker (deduplicated)
      if (fLat && fLng) {
        const fKey = `${fLat},${fLng}`;
        if (!flhfDrawn.has(fKey)) {
          flhfDrawn.add(fKey);
          const fIcon = L.divIcon({
            className: "flhf-icon",
            html: `<div style="background:#DC2626;color:#fff;width:26px;height:26px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35)">🏥</div>`,
            iconSize: [26, 26], iconAnchor: [13, 13],
          });
          L.marker([fLat, fLng], { icon: fIcon }).addTo(group)
            .bindPopup(`<strong>🏥 ${entry.flhf_name}</strong><br/><span style="font-size:12px">Ward: ${entry.ward}<br/>LGA: ${entry.lga}, ${entry.state}</span>`);
          bounds.push([fLat, fLng]);
        }
      }

      // Settlement marker
      if (sLat && sLng) {
        let sColor = "#F59E0B";
        if (activeTheme === "distance") sColor = getDistanceColor(entry.settlement_distance_to_flhf_km);
        L.circleMarker([sLat, sLng], {
          radius: 5, fillColor: sColor, color: "#fff", weight: 1.5, fillOpacity: 0.8,
        }).addTo(group).bindPopup(buildPopup(entry, "settlement"));
        bounds.push([sLat, sLng]);

        // Settlement distance line
        if (fLat && fLng && activeTheme === "distance") {
          L.polyline([[sLat, sLng], [fLat, fLng]], {
            color: sColor, weight: 1.5, dashArray: "3 3", opacity: 0.7,
          }).addTo(group);
          if (entry.settlement_distance_to_flhf_km != null) {
            const mLat = (sLat + fLat) / 2;
            const mLng = (sLng + fLng) / 2;
            const lbl = L.divIcon({
              className: "distance-label",
              html: `<div style="background:${sColor};color:#fff;font-size:9px;padding:1px 4px;border-radius:6px;font-weight:600;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.3)">${entry.settlement_distance_to_flhf_km} km</div>`,
              iconSize: [40, 14], iconAnchor: [20, 7],
            });
            L.marker([mLat, mLng], { icon: lbl, interactive: false }).addTo(group);
          }
        }
      }
    });

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [cascadedEntries, activeTheme, onEntryClick]);

  const buildPopup = (e: MicroplanEntry, type: "community" | "settlement") => {
    const name = type === "community" ? e.community_name : (e.settlement_name || "Settlement");
    const dist = type === "community" ? e.community_distance_to_flhf_km : e.settlement_distance_to_flhf_km;
    return `
      <div style="min-width:220px;font-family:system-ui">
        <strong style="font-size:14px">${name}</strong>
        ${type === "community" && e.settlement_name ? `<br/><span style="color:#666;font-size:11px">Settlement: ${e.settlement_name}</span>` : ""}
        <hr style="margin:4px 0;border-color:#eee"/>
        <div style="font-size:12px;line-height:1.6">
          <b>FLHF:</b> ${e.flhf_name}<br/>
          <b>Location:</b> ${e.state} → ${e.lga} → ${e.ward}<br/>
          ${e.estimated_total_population ? `<b>Population:</b> ${e.estimated_total_population.toLocaleString()}<br/>` : ""}
          ${dist != null ? `<b>Distance to FLHF:</b> ${dist} km<br/>` : ""}
          ${e.accessibility ? `<b>Access:</b> <span style="color:${ACCESS_COLORS[e.accessibility]?.color || '#666'}">${e.accessibility.replace(/_/g, " ")}</span><br/>` : ""}
          ${e.terrain_type ? `<b>Terrain:</b> ${TERRAIN_ICONS[e.terrain_type]?.emoji || ""} ${e.terrain_type}<br/>` : ""}
          ${e.security_clearance ? `<b>Security:</b> ${e.security_clearance.replace(/_/g, " ")}<br/>` : ""}
          ${e.cdd_from_community != null ? `<b>CDD from Community:</b> <span style="color:${e.cdd_from_community ? '#10B981' : '#EF4444'}">${e.cdd_from_community ? "Yes ✓" : "No ✗"}</span>` : ""}
        </div>
      </div>`;
  };

  const themeButtons: { key: ThematicLayer; label: string; icon: string }[] = [
    { key: "distance", label: "Distance", icon: "📏" },
    { key: "terrain", label: "Terrain", icon: "⛰️" },
    { key: "accessibility", label: "Access", icon: "🚧" },
    { key: "security", label: "Security", icon: "🛡️" },
    { key: "cdd_origin", label: "CDD Origin", icon: "👤" },
  ];

  const CascadeSelect = ({ value, onChange, options, placeholder, disabled }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string; disabled?: boolean }) => (
    <Select value={value || "all"} onValueChange={v => onChange(v === "all" ? "" : v)} disabled={disabled}>
      <SelectTrigger className="h-7 text-[10px] w-full min-w-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const resetZoom = () => { setZoomState(""); setZoomLga(""); setZoomWard(""); setZoomFlhf(""); setZoomCommunity(""); setZoomSettlement(""); };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2 px-3 pt-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Map className="h-4 w-4 text-primary" />
            Geo-enabled Microplan Map
          </CardTitle>
          <div className="flex items-center gap-1 flex-wrap">
            {themeButtons.map(t => (
              <Button
                key={t.key}
                variant={activeTheme === t.key ? "default" : "outline"}
                size="sm"
                className="text-[10px] h-7 px-2"
                onClick={() => setActiveTheme(prev => prev === t.key ? null : t.key)}
              >
                {t.icon} {t.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Cascading zoom filters */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5 mt-2">
          <CascadeSelect value={zoomState} onChange={v => { setZoomState(v); setZoomLga(""); setZoomWard(""); setZoomFlhf(""); setZoomCommunity(""); setZoomSettlement(""); }} options={stateOptions} placeholder="State" />
          <CascadeSelect value={zoomLga} onChange={v => { setZoomLga(v); setZoomWard(""); setZoomFlhf(""); setZoomCommunity(""); setZoomSettlement(""); }} options={lgaOptions} placeholder="LGA" disabled={!zoomState} />
          <CascadeSelect value={zoomWard} onChange={v => { setZoomWard(v); setZoomFlhf(""); setZoomCommunity(""); setZoomSettlement(""); }} options={wardOptions} placeholder="Ward" disabled={!zoomLga} />
          <CascadeSelect value={zoomFlhf} onChange={v => { setZoomFlhf(v); setZoomCommunity(""); setZoomSettlement(""); }} options={flhfOptions} placeholder="FLHF" disabled={!zoomWard} />
          <CascadeSelect value={zoomCommunity} onChange={v => { setZoomCommunity(v); setZoomSettlement(""); }} options={communityOptions} placeholder="Community" disabled={!zoomFlhf} />
          <CascadeSelect value={zoomSettlement} onChange={v => setZoomSettlement(v)} options={settlementOptions} placeholder="Settlement" disabled={!zoomCommunity} />
        </div>
        {(zoomState || activeTheme) && (
          <div className="flex items-center gap-2 mt-1.5">
            {zoomState && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={resetZoom}>
                ✕ Clear Zoom
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {/* CDD Analytics Bar */}
        <div className="px-3 py-2 border-b border-border/30 flex items-center gap-4 flex-wrap text-[11px]">
          <span className="font-semibold text-muted-foreground flex items-center gap-1">👤 CDD Origin:</span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
            From Community: <strong>{cddStats.fromComm}</strong> ({cddStats.pctFrom}%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
            External: <strong>{cddStats.notFromComm}</strong> ({cddStats.pctNot}%)
          </span>
          {cddStats.unknown > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
              Unknown: <strong>{cddStats.unknown}</strong>
            </span>
          )}
          {cddStats.total > 0 && (
            <div className="flex-1 min-w-[100px] max-w-[200px] h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full flex">
                <div className="bg-green-500 h-full" style={{ width: `${cddStats.pctFrom}%` }} />
                <div className="bg-red-500 h-full" style={{ width: `${cddStats.pctNot}%` }} />
              </div>
            </div>
          )}
        </div>

        <div ref={mapRef} className="h-[400px] md:h-[500px] w-full relative z-0" />

        {/* Dynamic Legend */}
        <div className="flex items-center gap-3 px-3 py-2 text-[10px] text-muted-foreground flex-wrap border-t border-border/30">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Community</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600 text-white text-[8px] font-bold text-center leading-3 inline-block">🏥</span> FLHF</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Settlement</span>
          <span className="border-l border-border/50 pl-2 ml-1" />
          {activeTheme === "distance" && DISTANCE_BANDS.map(b => (
            <span key={b.label} className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: b.color }} /> {b.label}</span>
          ))}
          {activeTheme === "accessibility" && Object.entries(ACCESS_COLORS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: v.color }} /> {v.label}</span>
          ))}
          {activeTheme === "security" && Object.entries(SECURITY_COLORS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: v.color }} /> {v.label}</span>
          ))}
          {activeTheme === "terrain" && Object.entries(TERRAIN_ICONS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1">{v.emoji} {k}</span>
          ))}
          {activeTheme === "cdd_origin" && (
            <>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> From Community</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> External CDD</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-400 inline-block" /> Unknown</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MicroplanMap;
