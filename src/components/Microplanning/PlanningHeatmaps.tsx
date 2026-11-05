import { memo, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, Loader2, MapPinned } from "lucide-react";
import { categoryOf, groupByState, HEAT_GRADIENT, normState, THEMES, WHO, type HeatEntry, type HeatTheme, type StateGroup } from "@/lib/microplanning/heatmaps";

type Feature = { type: "Feature"; properties: Record<string, string>; geometry: { type: string; coordinates: unknown } };
type FC = { type: "FeatureCollection"; features: Feature[] };

let lgaPromise: Promise<FC> | null = null;
const loadLgas = () => (lgaPromise ??= fetch("/nigeria-lga.geojson").then((r) => r.json()));
const wardCache = new Map<string, Promise<FC | null>>();
const WARD_URL = "https://services3.arcgis.com/BU6Aadhn6tbBEdyk/arcgis/rest/services/GRID3_NGA_operational_wards_v4_0/FeatureServer/0/query";
function loadWards(state: string) {
  const key = normState(state);
  if (!wardCache.has(key)) {
    const name = key === "FCT" ? "Federal Capital Territory" : state.trim().replace(/\s+state$/i, "");
    const q = new URLSearchParams({ where: `UPPER(state)='${name.toUpperCase().replace(/'/g, "''")}'`, outFields: "ward,lga,state", returnGeometry: "true", geometryPrecision: "4", maxAllowableOffset: "0.0015", outSR: "4326", resultRecordCount: "2000", f: "geojson" });
    wardCache.set(key, fetch(`${WARD_URL}?${q}`).then((r) => (r.ok ? r.json() : null)).then((d) => (d?.features?.length ? d : null)).catch(() => { wardCache.delete(key); return null; }));
  }
  return wardCache.get(key)!;
}

const THEME_ORDER: HeatTheme[] = ["accessibility", "security", "terrain", "population"];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const ThemeMap = memo(function ThemeMap({ group, theme, lgas, wards }: { group: StateGroup; theme: HeatTheme; lgas: Feature[]; wards: FC | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const data = useRef<L.LayerGroup | null>(null);
  const bounds = useRef<L.LatLngBounds | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { preferCanvas: true, zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors · Wards © GRID3", maxZoom: 18, opacity: 0.55 }).addTo(m);
    m.createPane("bounds"); m.getPane("bounds")!.style.zIndex = "450"; m.getPane("bounds")!.style.pointerEvents = "none";
    const lgaLayer = L.geoJSON({ type: "FeatureCollection", features: lgas } as never, { pane: "bounds", style: { color: WHO.navy, weight: 1.8, fill: false, opacity: 0.9 } }).addTo(m);
    L.geoJSON({ type: "FeatureCollection", features: lgas } as never, { pane: "bounds", style: { color: "#0B1F33", weight: 3.4, fill: false, opacity: 0.25 } }).addTo(m);
    bounds.current = lgaLayer.getBounds().isValid() ? lgaLayer.getBounds() : null;
    lgas.forEach((f) => {
      const c = L.geoJSON(f as never).getBounds().getCenter();
      L.marker(c, { pane: "bounds", interactive: false, icon: L.divIcon({ className: "", html: `<div style="font:600 9px system-ui;color:${WHO.navy};text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap;transform:translate(-50%,-50%)">${esc(f.properties.lga)}</div>` }) }).addTo(m);
    });
    data.current = L.layerGroup().addTo(m);
    if (bounds.current) m.fitBounds(bounds.current, { padding: [8, 8] }); else m.setView([9.1, 8.7], 6);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, [lgas]);

  useEffect(() => {
    const m = map.current;
    if (!m || !wards) return;
    const layer = L.geoJSON(wards as never, { pane: "bounds", style: { color: WHO.blue, weight: 0.7, dashArray: "3 2", fill: false, opacity: 0.75 } }).addTo(m);
    return () => { layer.remove(); };
  }, [wards]);

  useEffect(() => {
    const m = map.current, g = data.current;
    if (!m || !g) return;
    g.clearLayers();
    const maxPop = Math.max(1, ...group.points.map((p) => Number(p.entry.estimated_total_population) || 0));
    const heat: [number, number, number][] = [];
    for (const p of group.points) {
      const cat = categoryOf(p.entry, theme);
      const pop = Number(p.entry.estimated_total_population) || 0;
      const w = theme === "population" ? Math.sqrt(pop / maxPop) : cat.weight;
      if (w > 0) heat.push([p.lat, p.lng, w]);
      const r = theme === "population" ? 3 + 9 * Math.sqrt(pop / maxPop) : 4;
      L.circleMarker([p.lat, p.lng], { radius: r, color: "#ffffff", weight: 1, fillColor: cat.color, fillOpacity: 0.92 })
        .bindPopup(`<div style="font:12px system-ui;min-width:180px"><b>${esc(p.entry.community_name || "Community")}</b><br/>${esc(p.entry.ward)} · ${esc(p.entry.lga)}<br/><span style="color:${cat.color};font-weight:700">● ${esc(cat.label)}</span><br/>Population: ${pop.toLocaleString()}<br/><span style="color:#666">GPS ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span></div>`)
        .addTo(g);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (heat.length) (L as any).heatLayer(heat, { radius: 22, blur: 18, minOpacity: 0.25, max: 1, gradient: HEAT_GRADIENT }).addTo(g);
  }, [group, theme]);

  const t = THEMES[theme];
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    group.points.forEach((p) => { const k = categoryOf(p.entry, theme).key; c.set(k, (c.get(k) ?? 0) + 1); });
    return c;
  }, [group, theme]);

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
      <div className="flex items-center justify-between bg-primary px-3 py-1.5 text-primary-foreground">
        <span className="text-xs font-bold uppercase tracking-wide">{t.title}</span>
        <span className="text-[10px] opacity-90">{t.heatNote}</span>
      </div>
      <div ref={el} className="h-72 w-full" />
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2">
        {t.categories.map((c) => (
          <span key={c.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-border" style={{ background: c.color }} />{c.label} <b className="text-foreground">{counts.get(c.key) ?? 0}</b>
          </span>
        ))}
      </div>
    </div>
  );
});

function StateHeatmaps({ group, lgas }: { group: StateGroup; lgas: Feature[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [wards, setWards] = useState<FC | null>(null);
  const [wardState, setWardState] = useState<"loading" | "ok" | "none">("loading");
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "300px" });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    loadWards(group.state).then((w) => { if (live) { setWards(w); setWardState(w ? "ok" : "none"); } });
    return () => { live = false; };
  }, [visible, group.state]);

  return (
    <Card ref={ref} className="border-border/40 shadow-sm">
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <MapPinned className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold">{group.state} State</span>
          <Badge variant="secondary">{group.points.length.toLocaleString()} communities mapped</Badge>
          {group.noGps > 0 && <Badge variant="outline">{group.noGps.toLocaleString()} without GPS</Badge>}
          {group.outside > 0 && <Badge variant="outline" className="border-destructive/50 text-destructive">{group.outside.toLocaleString()} GPS outside {group.state} — not plotted</Badge>}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block h-0.5 w-4 bg-primary" /> LGA
            <span className="ml-2 inline-block w-4 border-t border-dashed border-primary" /> Ward
            {wardState === "loading" && visible && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
            {wardState === "none" && <span className="ml-1">(ward lines unavailable)</span>}
          </span>
        </div>
        {visible ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {THEME_ORDER.map((t) => <ThemeMap key={t} group={group} theme={t} lgas={lgas} wards={wards} />)}
          </div>
        ) : <div className="h-72" />}
      </CardContent>
    </Card>
  );
}

export default function PlanningHeatmaps({ entries }: { entries: HeatEntry[] }) {
  const [lgaFc, setLgaFc] = useState<FC | null>(null);
  useEffect(() => { loadLgas().then(setLgaFc).catch(() => setLgaFc({ type: "FeatureCollection", features: [] })); }, []);
  const groups = useMemo(() => (lgaFc ? groupByState(entries, lgaFc.features as never) : []), [entries, lgaFc]);
  const lgasByState = useMemo(() => {
    const m = new Map<string, Feature[]>();
    lgaFc?.features.forEach((f) => { const k = normState(f.properties.state); (m.get(k) ?? m.set(k, []).get(k)!).push(f); });
    return m;
  }, [lgaFc]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-destructive" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Planning heatmaps by State · live</p>
      </div>
      {!lgaFc && <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      {lgaFc && !groups.length && <p className="text-xs text-muted-foreground">No communities with State and GPS yet.</p>}
      {groups.map((g) => <StateHeatmaps key={g.state} group={g} lgas={lgasByState.get(normState(g.state)) ?? []} />)}
    </div>
  );
}
