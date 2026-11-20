import L from "leaflet";

/** Minimal entry shape shared by every Geo Microplanning map. */
export interface CatchmentEntry {
  flhf_name?: string | null;
  flhf_latitude?: number | null;
  flhf_longitude?: number | null;
  community_name?: string | null;
  settlement_name?: string | null;
  community_latitude?: number | null;
  community_longitude?: number | null;
  settlement_latitude?: number | null;
  settlement_longitude?: number | null;
}

export const CATCHMENT_PALETTE = [
  "#F4A261", "#90BE6D", "#4D96FF", "#E76F51", "#B388EB", "#2A9D8F",
  "#F9C74F", "#F28482", "#43AA8B", "#9C89B8", "#FFB4A2", "#577590",
];

export interface Catchment {
  key: string; name: string; color: string;
  facility: [number, number] | null;
  communities: { lat: number; lng: number; name: string }[];
}

const ok = (lat: unknown, lng: unknown) =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) &&
  lat !== 0 && lng !== 0 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Group points by FLHF; colours are stable by sorted facility name. */
export function buildCatchments(entries: readonly CatchmentEntry[]): Catchment[] {
  const map = new Map<string, Catchment>();
  for (const e of entries) {
    const name = String(e.flhf_name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const c = map.get(key) ?? map.set(key, { key, name, color: "", facility: null, communities: [] }).get(key)!;
    if (!c.facility && ok(e.flhf_latitude, e.flhf_longitude)) c.facility = [e.flhf_latitude!, e.flhf_longitude!];
    const s = ok(e.settlement_latitude, e.settlement_longitude);
    const lat = s ? e.settlement_latitude! : e.community_latitude, lng = s ? e.settlement_longitude! : e.community_longitude;
    if (ok(lat, lng)) c.communities.push({ lat: lat!, lng: lng!, name: String((s && e.settlement_name) || e.community_name || "") });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
    .map((c, i) => ({ ...c, color: CATCHMENT_PALETTE[i % CATCHMENT_PALETTE.length] }));
}

function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Rounded catchment outline: hull of facility + communities, padded by ~1.2 km. */
export function catchmentOutline(c: Catchment, padKm = 1.2): [number, number][] {
  const pts: [number, number][] = c.communities.map(p => [p.lat, p.lng]);
  if (c.facility) pts.push(c.facility);
  if (!pts.length) return [];
  const ring: [number, number][] = [];
  for (const [lat, lng] of pts) {
    const dLat = padKm / 111, dLng = padKm / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; ring.push([lat + dLat * Math.sin(t), lng + dLng * Math.cos(t)]); }
  }
  return hull(ring);
}

const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

export interface CatchmentLayerOptions { points?: boolean; legend?: boolean; fit?: boolean }

/**
 * Draw FLHF catchment areas (distinct colours), community points and "H" facility
 * markers on a Leaflet map. Returns a cleanup function.
 */
export function drawFlhfCatchments(map: L.Map, entries: readonly CatchmentEntry[], opts: CatchmentLayerOptions = {}): () => void {
  const { points = true, legend = true, fit = false } = opts;
  const catchments = buildCatchments(entries);
  if (!catchments.length) return () => {};
  if (!map.getPane("flhfAreas")) { const p = map.createPane("flhfAreas"); p.style.zIndex = "405"; }
  if (!map.getPane("flhfMarks")) { const p = map.createPane("flhfMarks"); p.style.zIndex = "640"; }
  const group = L.layerGroup();
  const bounds = L.latLngBounds([]);
  for (const c of catchments) {
    const outline = catchmentOutline(c);
    if (outline.length >= 3) {
      L.polygon(outline, { pane: "flhfAreas", color: c.color, weight: 1.6, opacity: 0.9, fillColor: c.color, fillOpacity: 0.28, smoothFactor: 1.5 })
        .bindTooltip(`<b>${esc(c.name)}</b><br/>${c.communities.length} communities / settlements`, { sticky: true, className: "flhf-catchment-tip" })
        .addTo(group);
      outline.forEach(p => bounds.extend(p));
    }
    if (points) for (const p of c.communities) {
      L.circleMarker([p.lat, p.lng], { pane: "flhfMarks", radius: 3.4, color: "#ffffff", weight: 0.8, fillColor: "#B3261E", fillOpacity: 0.95 })
        .bindTooltip(`${esc(p.name || "Community")} · ${esc(c.name)}`, { direction: "top" }).addTo(group);
    }
    if (c.facility) {
      L.marker(c.facility, {
        pane: "flhfMarks", zIndexOffset: 3000, title: `FLHF: ${c.name}`, alt: `FLHF: ${c.name}`,
        icon: L.divIcon({ className: "flhf-h-icon", html: `<span style="--flhf:${c.color}">H</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      }).bindTooltip(`<b>${esc(c.name)}</b><br/>Frontline Health Facility`, { direction: "top", offset: [0, -12] }).addTo(group);
    }
  }
  group.addTo(map);
  let control: L.Control | null = null;
  if (legend) {
    control = new L.Control({ position: "bottomright" });
    control.onAdd = () => {
      const div = L.DomUtil.create("div", "flhf-legend");
      const rows = catchments.slice(0, 10).map(c => `<div class="flhf-legend-row"><i style="background:${c.color}"></i><span>${esc(c.name)}</span></div>`).join("");
      const more = catchments.length > 10 ? `<div class="flhf-legend-more">+${catchments.length - 10} more FLHF areas</div>` : "";
      div.innerHTML = `<b>Legend</b>${rows}${more}<div class="flhf-legend-row"><span class="flhf-legend-h">H</span><span>FLHF location</span></div><div class="flhf-legend-row"><em></em><span>Community / settlement</span></div>`;
      L.DomEvent.disableClickPropagation(div); L.DomEvent.disableScrollPropagation(div);
      return div;
    };
    control.addTo(map);
  }
  if (fit && bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13, animate: false });
  return () => { group.clearLayers(); map.removeLayer(group); control?.remove(); };
}
