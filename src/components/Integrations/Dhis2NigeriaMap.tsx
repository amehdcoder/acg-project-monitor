import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { RotateCcw, MapPinned, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadNigeriaGeo, lgaKey } from "@/components/Dashboard/ops/lgaGeo";
import { Analytics, fmt, nameOf } from "./dhis2Pivot";

type AdminUnit = { id: string; name: string; level?: number; path?: string; ancestors?: { id: string; name: string; level?: number }[] };
type MapCell = { value: number; label: string; state?: string; lga?: string };
type BoundaryData = { states: any; national: any };

let boundaryPromise: Promise<BoundaryData> | null = null;
const loadOutlines = () => {
  if (!boundaryPromise) {
    boundaryPromise = Promise.all([
      fetch("/nigeria-state-outlines.geojson").then((r) => r.ok ? r.json() : Promise.reject(new Error("State boundaries unavailable"))),
      fetch("/nigeria-national-outline.geojson").then((r) => r.ok ? r.json() : Promise.reject(new Error("National boundary unavailable"))),
    ]).then(([states, national]) => ({ states, national })).catch((error) => {
      boundaryPromise = null;
      throw error;
    });
  }
  return boundaryPromise;
};

const clean = (value: unknown) => String(value ?? "").toLowerCase().replace(/\b(state|lga|local government area|area council)\b/g, "").replace(/[^a-z0-9]/g, "");
const aliases: Record<string, string> = { fct: "abuja", federalcapitalterritory: "abuja", nassarawa: "nasarawa" };
const same = (a: unknown, b: unknown) => {
  const aa = aliases[clean(a)] ?? clean(a);
  const bb = aliases[clean(b)] ?? clean(b);
  return aa === bb || (aa.length >= 5 && bb.length >= 5 && (aa.startsWith(bb) || bb.startsWith(aa)));
};

function unitLocation(unit: AdminUnit | undefined, label: string, states: Set<string>, lgas: Map<string, string[]>) {
  const hierarchy = [...(unit?.ancestors ?? []).map((x) => x.name), unit?.name ?? label]
    .concat(String(unit?.path ?? "").split(/[/>|]/)).filter(Boolean);
  const state = hierarchy.find((part) => [...states].some((name) => same(part, name)));
  const resolvedState = state ? [...states].find((name) => same(state, name)) : undefined;
  const candidates = resolvedState ? lgas.get(resolvedState) ?? [] : [...lgas.values()].flat();
  const lga = hierarchy.map((part) => candidates.find((name) => same(part, name))).find(Boolean);
  return { state: resolvedState, lga };
}

function palette(value: number, min: number, max: number) {
  const ratio = max <= min ? 0.7 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  return `hsl(var(--chart-secondary) / ${0.42 + ratio * 0.58})`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c] ?? c));
}

export default function Dhis2NigeriaMap({ analytics }: { analytics: Analytics }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dataLayerRef = useRef<L.GeoJSON | null>(null);
  const outlineLayersRef = useRef<L.LayerGroup | null>(null);
  const fullBoundsRef = useRef<L.LatLngBounds | null>(null);
  const [geo, setGeo] = useState<any | null>(null);
  const [outlines, setOutlines] = useState<BoundaryData | null>(null);
  const [selectedSeries, setSelectedSeries] = useState("all");

  useEffect(() => {
    let active = true;
    Promise.all([loadNigeriaGeo(), loadOutlines()]).then(([g, o]) => {
      if (active) { setGeo(g); setOutlines(o); }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const model = useMemo(() => {
    if (!geo) return { cells: new Map<string, MapCell>(), options: [] as { id: string; label: string }[], unmatched: [] as string[] };
    const hi = (name: string) => analytics.headers.findIndex((h) => h.name === name);
    const ouIndex = hi("ou");
    const valueIndex = hi("value");
    if (ouIndex < 0 || valueIndex < 0) return { cells: new Map<string, MapCell>(), options: [], unmatched: [] };
    const otherDims = analytics.headers.map((h) => h.name).filter((n) => !["ou", "value", "numerator", "denominator", "factor", "multiplier", "divisor"].includes(n));
    const optionMap = new Map<string, string>();
    analytics.rows.forEach((row) => {
      const key = otherDims.map((d) => row[hi(d)]).join("|");
      optionMap.set(key, otherDims.map((d) => nameOf(analytics, row[hi(d)])).join(" · ") || "All values");
    });
    const options = [...optionMap].map(([id, label]) => ({ id, label }));
    const states = new Set<string>(geo.features.map((f: any) => String(f.properties?.state ?? "")));
    const lgas = new Map<string, string[]>();
    geo.features.forEach((f: any) => {
      const state = String(f.properties?.state ?? "");
      if (!lgas.has(state)) lgas.set(state, []);
      lgas.get(state)?.push(String(f.properties?.lga ?? ""));
    });
    const units = new Map((analytics.organisationUnits ?? []).map((u) => [u.id, u]));
    const cells = new Map<string, MapCell>();
    const missing = new Set<string>();
    analytics.rows.forEach((row) => {
      const seriesKey = otherDims.map((d) => row[hi(d)]).join("|");
      if (selectedSeries !== "all" && seriesKey !== selectedSeries) return;
      const value = Number(row[valueIndex]);
      if (!Number.isFinite(value)) return;
      const ouId = row[ouIndex];
      const label = nameOf(analytics, ouId);
      const location = unitLocation(units.get(ouId), label, states, lgas);
      if (!location.state && !location.lga) { missing.add(label); return; }
      const key = location.lga ? lgaKey(location.state, location.lga) : `state:${clean(location.state)}`;
      const previous = cells.get(key);
      cells.set(key, { value: (previous?.value ?? 0) + value, label, ...location });
    });
    return { cells, options, unmatched: [...missing].sort() };
  }, [analytics, geo, selectedSeries]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const map = L.map(container, { zoomControl: true, attributionControl: false, minZoom: 4, maxZoom: 12, preferCanvas: true });
    map.setView([9.082, 8.6753], 5.5);
    mapRef.current = map;
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(container);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo || !outlines) return;
    if (dataLayerRef.current) map.removeLayer(dataLayerRef.current);
    if (outlineLayersRef.current) map.removeLayer(outlineLayersRef.current);
    const values = [...model.cells.values()].map((c) => c.value);
    const min = Math.min(...values, 0); const max = Math.max(...values, 0);
    const stateTotals = new Map<string, MapCell>();
    model.cells.forEach((cell, key) => { if (key.startsWith("state:")) stateTotals.set(clean(cell.state), cell); });
    const layer = L.geoJSON(geo, {
      style: (feature: any) => {
        const state = String(feature?.properties?.state ?? ""); const lga = String(feature?.properties?.lga ?? "");
        const cell = model.cells.get(lgaKey(state, lga)) ?? stateTotals.get(clean(state));
        return { fillColor: cell ? palette(cell.value, min, max) : "hsl(var(--muted))", fillOpacity: cell ? 0.86 : 0.38, color: "hsl(var(--border))", weight: 0.45, opacity: 0.85 };
      },
      onEachFeature: (feature: any, featureLayer) => {
        const state = String(feature?.properties?.state ?? ""); const lga = String(feature?.properties?.lga ?? "");
        const cell = model.cells.get(lgaKey(state, lga)) ?? stateTotals.get(clean(state));
        (featureLayer as L.Path).bindTooltip(`<div style="min-width:150px"><strong>${escapeHtml(lga)}</strong><br><span>${escapeHtml(state)}</span><hr style="margin:5px 0;border:0;border-top:1px solid #e2e8f0"><strong>${cell ? fmt(cell.value) : "No data"}</strong>${cell ? `<br><small>${escapeHtml(cell.label)}</small>` : ""}</div>`, { sticky: true, direction: "top" });
        featureLayer.on({
          mouseover: () => { (featureLayer as L.Path).setStyle({ weight: 2, color: "hsl(var(--foreground))" }); (featureLayer as any).bringToFront?.(); },
          mouseout: () => layer.resetStyle(featureLayer as any),
          click: () => { const bounds = (featureLayer as L.Polygon).getBounds(); if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 9 }); },
        });
      },
    }).addTo(map);
    dataLayerRef.current = layer;
    const stateLayer = L.geoJSON(outlines.states, { style: { color: "hsl(var(--foreground) / 0.72)", weight: 1.35, opacity: 0.78, fillOpacity: 0, interactive: false } });
    const nationalLayer = L.geoJSON(outlines.national, { style: { color: "hsl(var(--foreground))", weight: 2.8, opacity: 0.95, fillOpacity: 0, interactive: false } });
    outlineLayersRef.current = L.layerGroup([stateLayer, nationalLayer]).addTo(map);
    const bounds = layer.getBounds();
    if (bounds.isValid()) { fullBoundsRef.current = bounds; map.fitBounds(bounds, { padding: [7, 7] }); map.setMaxBounds(bounds.pad(0.35)); }
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }, [geo, outlines, model.cells]);

  const values = [...model.cells.values()].map((c) => c.value);
  const min = values.length ? Math.min(...values) : 0; const max = values.length ? Math.max(...values) : 0;
  return (
    <div className="relative h-full min-h-[220px] overflow-hidden rounded-md border border-border bg-muted/30">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute left-2 top-2 z-[500] flex max-w-[calc(100%-4rem)] items-center gap-1.5 rounded-md border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur">
        <MapPinned className="h-3.5 w-3.5 text-primary" />
        {model.options.length > 1 && (
          <select aria-label="Map data series" value={selectedSeries} onChange={(e) => setSelectedSeries(e.target.value)} className="h-7 max-w-52 rounded border border-input bg-background px-1.5 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-ring">
            <option value="all">All series combined</option>
            {model.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        )}
      </div>
      <Button type="button" variant="outline" size="icon" title="Reset to Nigeria" aria-label="Reset map to Nigeria" onClick={() => fullBoundsRef.current && mapRef.current?.fitBounds(fullBoundsRef.current, { padding: [7, 7] })} className="absolute right-2 top-2 z-[500] h-8 w-8 bg-card/95 shadow-sm">
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
      <div className="absolute bottom-2 left-2 z-[500] rounded-md border border-border bg-card/95 px-2.5 py-2 text-[10px] text-foreground shadow-sm backdrop-blur">
        <div className="mb-1 flex items-center gap-1 font-semibold"><Layers3 className="h-3 w-3 text-primary" />National · State · LGA</div>
        <div className="flex items-center gap-1.5"><span className="h-2.5 w-20 rounded-sm bg-gradient-to-r from-muted to-chart-secondary" /><span>{fmt(min)}</span><span>–</span><span>{fmt(max)}</span></div>
      </div>
      {model.unmatched.length > 0 && <div className="absolute bottom-2 right-2 z-[500] max-w-[46%] rounded-md border border-status-warning/30 bg-card/95 px-2 py-1.5 text-[10px] text-muted-foreground shadow-sm" title={model.unmatched.join(", ")}>{model.unmatched.length} DHIS2 location{model.unmatched.length === 1 ? "" : "s"} unmatched</div>}
    </div>
  );
}