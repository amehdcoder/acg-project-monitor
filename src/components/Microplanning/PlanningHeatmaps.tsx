import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, Flame, Loader2, MapPinned, Minus, Plus } from "lucide-react";
import { accessClass, BIVARIATE, categoryOf, DENSITY_COLORS, groupByState, normState, THEMES, type HeatEntry, type StateGroup } from "@/lib/microplanning/heatmaps";
import { catchmentColor, classIndex, ESPEN_MAPS, NO_DATA, type EspenEntry } from "@/lib/microplanning/espenMaps";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Layers } from "lucide-react";
import { buildLandblocks, SETTLEMENT_RADIUS_KM } from "@/lib/microplanning/landblocks";

type Feature = { type: "Feature"; properties: Record<string, string>; geometry: { type: string; coordinates: unknown } };
type FC = { type: "FeatureCollection"; features: Feature[] };
type View = "access_pop" | "accessibility" | "security" | "terrain" | "population";
const VIEWS: { id: View; label: string }[] = [
  { id: "access_pop", label: "Accessibility + Population" },
  { id: "accessibility", label: "Accessibility" },
  { id: "security", label: "Security clearance" },
  { id: "terrain", label: "Terrain types" },
  { id: "population", label: "Population density" },
];

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

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const INK = "#1F2A36";

function StateMap({ group, lgas, espen }: { group: StateGroup; lgas: Feature[]; espen?: string }) {
  const espenMap = espen ? ESPEN_MAPS.find((m) => m.id === espen) : undefined;
  const holder = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const blocksLayer = useRef<L.LayerGroup | null>(null);
  const [visible, setVisible] = useState(false);
  const [wards, setWards] = useState<FC | null>(null);
  const [wardState, setWardState] = useState<"loading" | "ok" | "none">("loading");
  const [view, setView] = useState<View>("access_pop");
  const [range, setRange] = useState<[number, number]>([33, 112]);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "300px" });
    if (holder.current) io.observe(holder.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    loadWards(group.state).then((w) => { if (live) { setWards(w); setWardState(w ? "ok" : "none"); } });
    return () => { live = false; };
  }, [visible, group.state]);

  const blocks = useMemo(() => (visible ? buildLandblocks(group.points.map((p) => ({ lat: p.lat, lng: p.lng, pop: Number(p.entry.estimated_total_population) || 0 })), lgas.map((f) => f.geometry)) : []), [visible, group, lgas]);

  // Base map, boundaries
  useEffect(() => {
    if (!visible || !el.current) return;
    const m = L.map(el.current, { preferCanvas: true, zoomControl: false, scrollWheelZoom: false });
    L.control.zoom({ position: "bottomright" }).addTo(m);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(m);
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors · Wards © GRID3 · Landblocks: nearest-community areas", maxZoom: 18, className: "espen-light-tiles" }).addTo(m);
    void tiles;
    m.createPane("blocks"); m.getPane("blocks")!.style.zIndex = "420";
    m.createPane("bounds"); m.getPane("bounds")!.style.zIndex = "460"; m.getPane("bounds")!.style.pointerEvents = "none";
    const fc = { type: "FeatureCollection", features: lgas } as never;
    L.geoJSON(fc, { pane: "bounds", style: { color: INK, weight: 4.5, fill: false, opacity: 0.85 } }).addTo(m); // outer State casing
    const lgaLayer = L.geoJSON(fc, { pane: "bounds", style: { color: INK, weight: 1.8, fill: false, opacity: 1 } }).addTo(m);
    lgas.forEach((f) => {
      const c = L.geoJSON(f as never).getBounds().getCenter();
      L.marker(c, { pane: "bounds", interactive: false, icon: L.divIcon({ className: "", html: `<div style="font:700 10px system-ui;letter-spacing:.02em;color:${INK};text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;white-space:nowrap;transform:translate(-50%,-50%)">${esc(f.properties.lga)}</div>` }) }).addTo(m);
    });
    blocksLayer.current = L.layerGroup().addTo(m);
    const b = lgaLayer.getBounds();
    if (b.isValid()) m.fitBounds(b, { padding: [10, 10] }); else m.setView([9.1, 8.7], 6);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, [visible, lgas]);

  useEffect(() => {
    const m = map.current;
    if (!m || !wards) return;
    const layer = L.geoJSON(wards as never, { pane: "bounds", style: { color: "#455A64", weight: 0.8, dashArray: "4 3", fill: false, opacity: 0.9 } }).addTo(m);
    return () => { layer.remove(); };
  }, [wards, visible]);

  // Landblocks
  useEffect(() => {
    const g = blocksLayer.current;
    if (!g) return;
    g.clearLayers();
    const [lo, hi] = range;
    const dClass = (d: number) => (d >= hi ? 2 : d >= lo ? 1 : 0);
    for (const b of blocks) {
      const p = group.points[b.index], e = p.entry;
      const pop = Number(e.estimated_total_population) || 0;
      if (hideEmpty && pop <= 0) continue;
      let fill: string, label: string;
      if (espen === "catchment") { fill = catchmentColor((e as EspenEntry).flhf_name); label = `Catchment: ${(e as EspenEntry).flhf_name || "FLHF not recorded"}`; }
      else if (espenMap) { const v = espenMap.value(e as EspenEntry, b.areaKm2); fill = v == null ? NO_DATA : espenMap.colors[classIndex(espenMap, v)]; label = `${espenMap.legendTitle}: ${v == null ? "not recorded" : espenMap.fmt(v)}`; }
      else if (view === "population") { fill = DENSITY_COLORS[dClass(b.density)]; label = `${Math.round(b.density).toLocaleString()} pop/km²`; }
      else if (view === "access_pop") {
        const a = accessClass(e);
        fill = a == null ? "#C3C9CF" : (b.density >= lo ? BIVARIATE.high : BIVARIATE.low)[a];
        label = `${categoryOf(e, "accessibility").label} · ${b.density >= lo ? "High" : "Low"} population`;
      } else { const c = categoryOf(e, view); fill = c.color; label = c.label; }
      L.geoJSON({ type: "MultiPolygon", coordinates: b.rings } as never, { pane: "blocks", style: { color: "#ffffff", weight: 0.6, fillColor: fill, fillOpacity: 0.82 } })
        .bindPopup(`<div style="font:12px system-ui;min-width:200px"><div style="font-weight:700;font-size:13px">${esc(e.community_name || "Community")}</div><div style="color:#5b6670">${esc(e.ward)} · ${esc(e.lga)}</div><div style="margin:6px 0;padding:4px 6px;border-left:4px solid ${fill};background:#f5f6f7">${esc(label)}</div><table style="width:100%;font-size:11px"><tr><td>Population</td><td style="text-align:right"><b>${pop.toLocaleString()}</b></td></tr><tr><td>Landblock area</td><td style="text-align:right">${b.areaKm2.toFixed(1)} km²</td></tr><tr><td>Density</td><td style="text-align:right">${Math.round(b.density).toLocaleString()} /km²</td></tr><tr><td>Accessibility</td><td style="text-align:right">${esc(categoryOf(e, "accessibility").label)}</td></tr><tr><td>Security</td><td style="text-align:right">${esc(categoryOf(e, "security").label)}</td></tr><tr><td>Terrain</td><td style="text-align:right">${esc(categoryOf(e, "terrain").label)}</td></tr><tr><td>GPS</td><td style="text-align:right">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</td></tr></table></div>`)
        .addTo(g);
    }
    for (const p of group.points) L.circleMarker([p.lat, p.lng], { pane: "blocks", radius: 1.8, stroke: false, fillColor: "#3D4650", fillOpacity: 0.75, interactive: false }).addTo(g);
  }, [blocks, view, range, hideEmpty, group, espen, espenMap]);

  const legend = espen === "catchment" ? (
    <div className="space-y-1">
      {[...new Set(group.points.map((p) => String((p.entry as EspenEntry).flhf_name ?? "").trim()))].sort().slice(0, 20).map((f) => {
        const k = group.points.filter((p) => String((p.entry as EspenEntry).flhf_name ?? "").trim() === f).length;
        return <div key={f || "none"} className="flex items-center gap-2 text-[11px]"><span className="h-4 w-6 rounded-sm" style={{ background: catchmentColor(f) }} /><span className="flex-1 truncate">{f || "Not recorded"}</span><b>{k}</b></div>;
      })}
    </div>
  ) : espenMap ? (
    <div className="space-y-1">
      <div className="mb-1 text-[10px] font-semibold">{espenMap.legendTitle}</div>
      {espenMap.colors.map((c, i) => {
        const k = group.points.filter((p) => { const v = espenMap.value(p.entry as EspenEntry, 1); return v != null && classIndex(espenMap, v) === i; }).length;
        const showCount = !/\/ km²/.test(espenMap.legendTitle);
        return <div key={c} className="flex items-center gap-2 text-[11px]"><span className="h-4 w-6 rounded-sm" style={{ background: c }} /><span className="flex-1">{espenMap.labels[i]}</span>{showCount && <b>{k}</b>}</div>;
      })}
      <div className="flex items-center gap-2 text-[11px]"><span className="h-4 w-6 rounded-sm" style={{ background: NO_DATA }} /><span className="flex-1">Not recorded</span><b>{group.points.filter((p) => espenMap.value(p.entry as EspenEntry, 1) == null).length}</b></div>
      <p className="pt-1 text-[9px] leading-snug text-muted-foreground">{espenMap.description}</p>
    </div>
  ) : view === "access_pop" ? (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between py-1 text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">Population</span><span>Low</span><span>High</span></div>
      <div>
        <div className="mb-1 text-[10px] font-semibold">Accessibility</div>
        <div className="grid grid-cols-3 gap-1 text-center text-[9px] text-muted-foreground"><span>Reachable</span><span>Hard / seasonal</span><span>Inaccessible</span>
          {[...BIVARIATE.low, ...BIVARIATE.high].map((c, i) => <span key={i} className="h-6 w-full rounded-sm" style={{ background: c }} />)}</div>
      </div>
    </div>
  ) : view === "population" ? (
    <div>
      <div className="mb-1 text-[10px] font-semibold">Population Density (pop / km²)</div>
      <div className="grid grid-cols-3 gap-1 text-center text-[10px] text-muted-foreground"><span>0 – {range[0]}</span><span>{range[0]} – {range[1]}</span><span>{range[1]}+</span>
        {DENSITY_COLORS.map((c) => <span key={c} className="h-7 rounded-sm" style={{ background: c }} />)}</div>
    </div>
  ) : (
    <div className="space-y-1">
      {THEMES[view].categories.map((c) => {
        const n = group.points.filter((p) => categoryOf(p.entry, view).key === c.key).length;
        return <div key={c.key} className="flex items-center gap-2 text-[11px]"><span className="h-4 w-6 rounded-sm" style={{ background: c.color }} /><span className="flex-1">{c.label}</span><b>{n}</b></div>;
      })}
    </div>
  );

  return (
    <Card ref={holder} className="overflow-hidden border-border/40 shadow-sm">
      <CardContent className="space-y-0 p-0">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <MapPinned className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold">{group.state} State</span>
          <Badge variant="secondary">{group.points.length.toLocaleString()} settlements mapped</Badge>
          {group.noGps > 0 && <Badge variant="outline">{group.noGps.toLocaleString()} without GPS</Badge>}
          {group.outside > 0 && <Badge variant="outline" className="border-destructive/50 text-destructive">{group.outside.toLocaleString()} GPS outside {group.state} — not plotted</Badge>}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block h-1 w-5 bg-foreground" /> State / LGA
            <span className="ml-2 inline-block w-5 border-t border-dashed border-muted-foreground" /> Ward
            {wardState === "loading" && visible && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
            {wardState === "none" && <span className="ml-1">(ward lines unavailable)</span>}
          </span>
        </div>
        <div className="relative h-[560px] w-full">
          <div ref={el} className="absolute inset-0" />
          {visible && (
            <div className="absolute left-3 top-3 z-[500] w-72 rounded-md border bg-card shadow-lg">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"><Eye className="h-3.5 w-3.5" /> Visualizations</span>
                <button className="rounded p-0.5 hover:bg-muted" onClick={() => setPanelOpen((o) => !o)} aria-label={panelOpen ? "Collapse panel" : "Expand panel"}>{panelOpen ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</button>
              </div>
              {panelOpen && (
                <div className="max-h-[480px] space-y-3 overflow-auto px-3 py-2">
                  {!espen && <div className="space-y-1.5" role="radiogroup">
                    {VIEWS.map((v) => (
                      <label key={v.id} className="flex cursor-pointer items-center gap-2 text-xs">
                        <input type="radio" name={`viz-${group.state}`} className="accent-primary" checked={view === v.id} onChange={() => setView(v.id)} />{v.label}
                      </label>
                    ))}
                  </div>}
                  <div className={espen ? "" : "border-t pt-2"}><div className="mb-1.5 text-xs font-semibold">Legend</div>{legend}</div>
                  {!espen && (view === "population" || view === "access_pop") && (
                    <div className="border-t pt-2">
                      <div className="mb-1 text-xs font-semibold">Adjust Legend</div>
                      <div className="text-[10px] text-muted-foreground">Population Density (pop / km²)</div>
                      <div className="flex items-center gap-2 text-[10px]"><span>{range[0]}</span>
                        <Slider min={1} max={500} step={1} value={range} onValueChange={(v) => setRange([Math.min(v[0], v[1] - 1), v[1]] as [number, number])} className="flex-1" /><span>{range[1]}</span></div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 border-t pt-2 text-xs"><Checkbox checked={hideEmpty} onCheckedChange={(c) => setHideEmpty(!!c)} /> Hide unpopulated landblocks</label>
                  <p className="text-[9px] leading-snug text-muted-foreground">Each landblock is the area closest to a mapped settlement (max {SETTLEMENT_RADIUS_KM} km), clipped to the State boundary.</p>
                </div>
              )}
            </div>
          )}
          {!visible && <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        </div>
      </CardContent>
    </Card>
  );
}
const StateMapMemo = memo(StateMap);
const EXTRA = [
  { id: "catchment", title: "Health facility catchment areas", description: "Landblocks coloured by the FLHF each settlement reports to.", colors: ["#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD"] },
  ...ESPEN_MAPS.map((m) => ({ id: m.id, title: m.title, description: m.description, colors: m.colors })),
];

export default function PlanningHeatmaps({ entries: liveEntries }: { entries: HeatEntry[] }) {
  // Only rebuild maps when mapped content actually changes, and never block the page while doing so.
  const deferred = useDeferredValue(liveEntries);
  const sigRef = useRef<{ sig: string; entries: HeatEntry[] }>({ sig: "", entries: [] });
  const entries = useMemo(() => {
    const sig = deferred.length + "|" + deferred.map((e) => JSON.stringify(e)).join("\u0001");
    if (sig !== sigRef.current.sig) sigRef.current = { sig, entries: deferred };
    return sigRef.current.entries;
  }, [deferred]);
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
      <style>{`.espen-light-tiles{filter:grayscale(1) brightness(1.08) contrast(.82)}`}</style>
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-destructive" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Planning heatmaps by State · live</p>
      </div>
      {!lgaFc && <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      {lgaFc && !groups.length && <p className="text-xs text-muted-foreground">No communities with State and GPS yet.</p>}
      {groups.map((g) => <StateMapMemo key={g.state} group={g} lgas={lgasByState.get(normState(g.state)) ?? []} />)}
      {groups.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">ESPEN microplanner thematic maps · {EXTRA.length} maps</p></div>
          {EXTRA.map((x) => (
            <Collapsible key={x.id} className="rounded-lg border bg-card shadow-sm">
              <CollapsibleTrigger className="group flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50">
                <span className="flex h-6 w-10 overflow-hidden rounded-sm">{x.colors.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</span>
                <span className="flex-1"><span className="block text-sm font-semibold">{x.title}</span><span className="block text-[11px] text-muted-foreground">{x.description}</span></span>
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 border-t p-3">
                {groups.map((g) => <StateMapMemo key={g.state} group={g} lgas={lgasByState.get(normState(g.state)) ?? []} espen={x.id} />)}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
