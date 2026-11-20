import L from "leaflet";

/**
 * Public reference layers for Geo Microplanning maps: Esri World Imagery
 * (satellite) as a switchable base, plus OpenStreetMap major roads, rivers,
 * forests and desert/sand areas fetched for the visible area via Overpass.
 * Only the map's bounding box is sent upstream — never project records.
 */
export const GEO_FEATURE_STYLES = {
  road: { label: "Major road", color: "#D9480F", weight: 2.6 },
  river: { label: "River / stream", color: "#1C7ED6", weight: 2.4 },
  forest: { label: "Forest / woodland", color: "#2B8A3E" },
  desert: { label: "Desert / sand", color: "#E0B860" },
} as const;

const ENDPOINT = "https://overpass-api.de/api/interpreter";
const MIN_ZOOM = 9;

export function overpassQuery(b: L.LatLngBounds, zoom: number): string {
  const bbox = `${b.getSouth().toFixed(4)},${b.getWest().toFixed(4)},${b.getNorth().toFixed(4)},${b.getEast().toFixed(4)}`;
  const roads = zoom >= 12 ? "motorway|trunk|primary|secondary" : "motorway|trunk|primary";
  const rivers = zoom >= 12 ? "river|stream|canal" : "river";
  return `[out:json][timeout:20];(way["highway"~"^(${roads})$"](${bbox});way["waterway"~"^(${rivers})$"](${bbox});way["natural"~"^(wood|sand|desert)$"](${bbox});way["landuse"="forest"](${bbox}););out geom 4000;`;
}

type Way = { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };
export function classifyWay(tags: Record<string, string> = {}): keyof typeof GEO_FEATURE_STYLES | null {
  if (tags.highway) return "road";
  if (tags.waterway) return "river";
  if (tags.landuse === "forest" || tags.natural === "wood") return "forest";
  if (tags.natural === "sand" || tags.natural === "desert") return "desert";
  return null;
}

export function attachGeoFeatures(map: L.Map, opts: { legend?: boolean } = {}): () => void {
  if (!map.getPane("geoFeatures")) { const p = map.createPane("geoFeatures"); p.style.zIndex = "402"; p.style.pointerEvents = "none"; }
  const IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const imgOpts = { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" };
  const satellite = L.tileLayer(IMAGERY, imgOpts);
  const labels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 });
  const hybrid = L.layerGroup([L.tileLayer(IMAGERY, imgOpts), labels]);
  const features = L.layerGroup().addTo(map);
  const layers = L.control.layers({}, { "Satellite imagery": satellite, "Satellite + labels": hybrid, "Roads, rivers, forests & deserts": features }, { position: "topright", collapsed: true }).addTo(map);
  let timer = 0, ctrl: AbortController | null = null, lastKey = "", disposed = false;
  const status = L.DomUtil.create("div", "geo-features-status");
  const load = () => {
    if (disposed || !map.hasLayer(features)) return;
    const z = map.getZoom();
    if (z < MIN_ZOOM) { features.clearLayers(); lastKey = ""; status.textContent = `Zoom in to see roads, rivers, forests & deserts`; return; }
    const b = map.getBounds().pad(0.1), key = `${b.toBBoxString()}|${z >= 12}`;
    if (key === lastKey) return;
    lastKey = key; ctrl?.abort(); ctrl = new AbortController();
    status.textContent = "Loading roads, rivers, forests & deserts…";
    fetch(ENDPOINT, { method: "POST", body: new URLSearchParams({ data: overpassQuery(b, z) }), signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((json: { elements?: Way[] }) => {
        if (disposed) return;
        features.clearLayers();
        for (const w of json.elements ?? []) {
          const kind = classifyWay(w.tags); const pts = (w.geometry ?? []).map(g => [g.lat, g.lon] as [number, number]);
          if (!kind || pts.length < 2) continue;
          const s = GEO_FEATURE_STYLES[kind];
          if (kind === "road" || kind === "river") {
            L.polyline(pts, { pane: "geoFeatures", color: s.color, weight: "weight" in s ? s.weight : 2, opacity: 0.9, interactive: false }).addTo(features);
          } else {
            L.polygon(pts, { pane: "geoFeatures", color: s.color, weight: 0.6, fillColor: s.color, fillOpacity: 0.35, interactive: false }).addTo(features);
          }
        }
        status.textContent = "";
      })
      .catch(e => { if ((e as Error).name !== "AbortError") { lastKey = ""; status.textContent = "Public road/river/forest data unavailable right now"; } });
  };
  const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(load, 450); };
  map.on("moveend", schedule); map.on("overlayadd", schedule);
  let legend: L.Control | null = null;
  if (opts.legend !== false) {
    legend = new L.Control({ position: "bottomleft" });
    legend.onAdd = () => {
      const d = L.DomUtil.create("div", "flhf-legend geo-features-legend");
      d.innerHTML = `<b>Physical features</b>` + Object.values(GEO_FEATURE_STYLES).map(s =>
        "weight" in s ? `<div class="flhf-legend-row"><s style="background:${s.color}"></s><span>${s.label}</span></div>`
          : `<div class="flhf-legend-row"><i style="background:${s.color}"></i><span>${s.label}</span></div>`).join("")
        + `<div class="geo-features-src">OpenStreetMap · Esri imagery</div>`;
      d.appendChild(status);
      L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
      return d;
    };
    legend.addTo(map);
  }
  schedule();
  return () => {
    disposed = true; window.clearTimeout(timer); ctrl?.abort();
    map.off("moveend", schedule); map.off("overlayadd", schedule);
    features.clearLayers(); [features, satellite, hybrid].forEach(l => map.removeLayer(l));
    layers.remove(); legend?.remove();
  };
}
