import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { intersection } from "polygon-clipping";
import { Crosshair, MapPinned, Layers3, AlertTriangle, Upload, Droplets, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { dustOverlap, facilityReporting, morbidityCount, parseEnvironmentalEvidence, type EnvironmentalFeature } from "@/lib/eyeReport/environment";
import { loadNigeriaGeo } from "@/components/Dashboard/ops/lgaGeo";
import { boundaryAt, locatedReports, MAP_METRICS, mapValue, type MapMetric, type BoundaryFeature } from "@/lib/eyeReport/mapModel";
import { normCsom, normSummary, t, totals, vaTotal, pct, type EyeReportRow } from "@/lib/eyeReport/definition";

const token = (name: string) => `hsl(${getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()})`;
function text(tag: string, value: string, className = "") { const node = document.createElement(tag); node.textContent = value; node.className = className; return node; }

export default function EyeReportMap({ rows, sex }: { rows: EyeReportRow[]; sex: "all" | "m" | "f" }) {
  const root = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const bounds = useRef<L.LatLngBounds | null>(null);
  const [geo, setGeo] = useState<{ features: BoundaryFeature[] } | null>(null);
  const [outlines, setOutlines] = useState<any>(null);
  const [error, setError] = useState("");
  const [state, setState] = useState("Jigawa");
  const [metric, setMetric] = useState<MapMetric>("consulted");
  const [selected, setSelected] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fittedState = useRef<string | null>(null);
  const [environment, setEnvironment] = useState<EnvironmentalFeature[]>([]);
  const [importError, setImportError] = useState("");
  const [visible, setVisible] = useState({ reports: true, cataract: true, tt: true, heat: false, dust: true, water: true, wash: true, basemap: true });
  useEffect(() => {
    let live = true;
    Promise.all([loadNigeriaGeo(), fetch("/eye-state-boundaries.geojson").then((r) => { if (!r.ok) throw new Error(); return r.json(); })])
      .then(([g, o]) => { if (live) { setGeo(g); setOutlines(o); } }).catch(() => { if (live) setError("State and LGA boundaries could not be loaded. Reconnect and reopen the dashboard."); });
    return () => { live = false; };
  }, []);
  const located = useMemo(() => locatedReports(rows, geo?.features ?? []), [rows, geo]);
  const states = useMemo(() => [...new Set(geo?.features.map((f) => f.properties.state) ?? ["Jigawa"])].sort(), [geo]);
  const activeState = state !== "auto" && states.includes(state) ? state : located.find((r) => r.state)?.state ?? null;
  const points = located.filter((r) => r.state === activeState);
  const active = points.find((r) => r.report.id === selected);
  useEffect(() => {
    if (!root.current) return;
    const instance = L.map(root.current, { preferCanvas: false, scrollWheelZoom: true, minZoom: 4, maxZoom: 19 }).setView([12.1, 9.5], 8);
    instance.attributionControl.addAttribution("Nigeria administrative boundaries · GADM");
    map.current = instance;
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false })); observer.observe(root.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !visible.basemap) return;
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(instance);
    return () => { instance.removeLayer(tiles); };
  }, [visible.basemap]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !geo || !outlines) return;
    const layers = L.layerGroup().addTo(instance);
    const features = geo.features.filter((f) => !activeState || f.properties.state === activeState);
    const diseaseTotal = (p: typeof points[number]) => (visible.cataract ? morbidityCount(p.report, "cataract", sex) : 0) + (visible.tt ? morbidityCount(p.report, "tt", sex) : 0);
    const shade = (value: number | null) => value === null ? "muted-foreground" : metric === "outcome" ? value >= 80 ? "eye-teal" : value >= 60 ? "eye-gold" : "eye-rose" : value <= 0 ? "eye-violet" : "eye-blue";
    const lgaLayer = L.geoJSON({ type: "FeatureCollection", features } as any, {
      style: (f) => {
        const reported = points.some((p) => p.lga === f?.properties.lga);
        return { color: token("eye-blue"), weight: 1.2, opacity: 0.9, fillColor: token(reported ? "eye-mint" : "eye-sky"), fillOpacity: visible.basemap ? 0.15 : 0.75 };
      },
      onEachFeature: (f, layer) => {
        const tooltip = text("div", `${f.properties.lga} · ${f.properties.state}`);
        layer.bindTooltip(tooltip, { sticky: true });
        const lgaPoints = points.filter((p) => p.lga === f.properties.lga);
        const detail = text("div", `${f.properties.lga} · ${lgaPoints.length} GPS reports · ${lgaPoints.reduce((sum, p) => sum + diseaseTotal(p), 0)} selected morbidity screenings`);
        layer.bindPopup(detail);
        layer.on("click", () => { const b = (layer as L.Polygon).getBounds(); if (b.isValid()) instance.fitBounds(b, { padding: [24, 24], maxZoom: 12 }); });
      },
    }).addTo(layers);
    if (visible.heat && points.some((p) => diseaseTotal(p) > 0)) {
      const maxCases = Math.max(1, ...points.map(diseaseTotal));
      (L as any).heatLayer(points.filter((p) => diseaseTotal(p) > 0).map((p) => [p.gps.lat, p.gps.lng, diseaseTotal(p) / maxCases]), {
        radius: 32, blur: 24, maxZoom: 12, minOpacity: 0.25,
        gradient: { 0.2: token("eye-teal"), 0.5: token("eye-gold"), 0.75: token("eye-orange"), 1: token("eye-rose") },
      }).addTo(layers);
    }
    const stateGeometry = outlines.features.find((f: any) => f.properties.state === activeState)?.geometry;
    const env = environment.flatMap((f) => {
      if (!visible[f.properties.kind]) return [];
      if (f.geometry.type === "Point") return boundaryAt(f.geometry.coordinates[1], f.geometry.coordinates[0], features) ? [f] : [];
      if (!stateGeometry) return [];
      const clipped = intersection(f.geometry.coordinates, stateGeometry.coordinates);
      return clipped.length ? [{ ...f, geometry: { type: "MultiPolygon" as const, coordinates: clipped } }] : [];
    });
    // Clip dust zones to the selected State; retain original geometry for overlap analysis.
    L.geoJSON({ type: "FeatureCollection", features: env } as any, {
      style: { color: token("eye-orange"), weight: 2, dashArray: "6 4", fillColor: token("eye-gold"), fillOpacity: 0.2 },
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 7, color: token("eye-paper"), weight: 2, fillColor: token(f.properties.kind === "water" ? "eye-blue" : "eye-teal"), fillOpacity: 1 }),
      onEachFeature: (f, layer) => {
        const popup = document.createElement("div");
        popup.append(text("strong", f.properties.name), text("p", `${f.properties.kind === "dust" ? "Dust-prone zone" : f.properties.kind === "water" ? "Water access" : "WASH point"} · ${f.properties.observed_at}`), text("p", `Source: ${f.properties.source}`));
        if (f.geometry.type === "Point") popup.append(text("p", `${f.geometry.coordinates[1].toFixed(6)}, ${f.geometry.coordinates[0].toFixed(6)}`));
        layer.bindPopup(popup).bindTooltip(text("div", f.properties.name));
      },
    }).addTo(layers);
    L.geoJSON(outlines, { filter: (f) => !activeState || f.properties.state === activeState,
      style: { color: token("eye-deep"), weight: 3, fill: false, interactive: false } }).addTo(layers);
    const max = Math.max(1, ...points.map((p) => mapValue(p.report, metric, sex) ?? 0));
    for (const p of points) {
      const value = mapValue(p.report, metric, sex);
      const popup = document.createElement("div"); popup.className = "space-y-1 text-eye-ink";
      popup.append(text("strong", p.report.facility_name), text("p", `${p.report.report_date} · ${p.lga ?? "Unmatched LGA"}`), text("p", `${MAP_METRICS.find((m) => m.key === metric)?.label}: ${value === null ? "Not assessed" : metric === "outcome" ? `${value.toFixed(1)}%` : value.toLocaleString()}`), text("p", `${p.gps.lat.toFixed(6)}, ${p.gps.lng.toFixed(6)} · ±${Math.round(p.gps.accuracy)} m`));
      const reporting = facilityReporting(p.report, rows, sex);
      popup.append(text("p", `Reporting-day coverage: ${reporting.rate?.toFixed(1) ?? "—"}% (${reporting.days}/${reporting.span} calendar days in observed period)`), text("p", `Cataract screened: ${morbidityCount(p.report, "cataract", sex)} · TT screened: ${morbidityCount(p.report, "tt", sex)}`));
      const overlapping = dustOverlap(p.gps.lat, p.gps.lng, environment);
      if (overlapping.length) popup.append(text("p", `Dust-zone overlap: ${overlapping.map((f) => f.properties.name).join(", ")} · not a causal diagnosis`));
      const cases = diseaseTotal(p);
      if (!visible.reports && !cases) continue;
      const circle = L.circleMarker([p.gps.lat, p.gps.lng], { radius: visible.reports ? metric === "outcome" ? 10 : 7 + Math.sqrt((value ?? 0) / max) * 13 : 6,
        color: token("eye-paper"), weight: 2.5, fillColor: token(shade(value)), fillOpacity: 0.9 }).addTo(layers);
      circle.bindPopup(popup).bindTooltip(text("div", `${p.report.facility_name} · ${p.report.report_date}`));
      circle.on("click", () => setSelected(p.report.id));
      for (const disease of ["cataract", "tt"] as const) {
        const count = morbidityCount(p.report, disease, sex);
        if (!visible[disease] || !count) continue;
        const marker = L.circleMarker([p.gps.lat, p.gps.lng], { radius: (disease === "cataract" ? 15 : 23) + Math.min(8, Math.sqrt(count)), color: token(disease === "cataract" ? "eye-orange" : "eye-rose"), weight: 3, fill: false, dashArray: disease === "tt" ? "4 3" : undefined }).addTo(layers);
        marker.bindTooltip(text("div", `${p.report.facility_name} · ${disease === "tt" ? "TT" : "Cataract"}: ${count} screened`)).bindPopup(popup.cloneNode(true) as HTMLElement);
        marker.on("click", () => setSelected(p.report.id));
      }
    }
    const b = lgaLayer.getBounds(); bounds.current = b;
    if (b.isValid() && fittedState.current !== activeState) { instance.fitBounds(b, { padding: [16, 16] }); fittedState.current = activeState; }
    return () => { instance.removeLayer(layers); };
  }, [geo, outlines, activeState, located, metric, sex, visible, environment, rows]);
  const c = active ? normCsom(active.report.csom) : null;
  const tt = active ? totals(normSummary(active.report.summary)) : null;
  const outside = located.filter((p) => !p.state).length;
  return <section className="border-y border-eye-blue/20 bg-card py-5" aria-label="Eye Health reporting location map">
    <div className="flex flex-wrap items-start justify-between gap-4 px-4">
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-eye-teal">{activeState ?? "Nigeria"} · Geographic evidence</p><h2 className="mt-1 flex items-start gap-2 text-xl font-bold text-eye-deep"><MapPinned className="mt-1 h-5 w-5 shrink-0" />Environmental Risk &amp; Blindness Corridor</h2><p className="mt-1 text-xs text-muted-foreground">{located.length} / {rows.length} reports with GPS · {points.length} in this State · {rows.length - located.length} without GPS</p></div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Map State" value={state !== "auto" && states.includes(state) ? state : "auto"} onChange={(e) => { setState(e.target.value); setSelected(null); }} className="h-12 max-w-full rounded-md border bg-background px-3 text-sm"><option value="auto">Latest GPS State</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
        <select aria-label="Map indicator" value={metric} onChange={(e) => setMetric(e.target.value as MapMetric)} className="h-12 max-w-full rounded-md border bg-background px-3 text-sm">{MAP_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
        <Button variant="outline" size="icon" className="h-12 w-12" title="Fit State boundaries" aria-label="Fit State boundaries" onClick={() => { if (bounds.current?.isValid()) map.current?.fitBounds(bounds.current, { padding: [16, 16] }); }}><Crosshair className="h-4 w-4" /></Button>
      </div>
    </div>
    {error && <p role="alert" className="px-4 py-3 text-sm text-destructive">{error}</p>}
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="relative isolate min-w-0 bg-eye-sky"><div ref={root} className="h-[440px] w-full sm:h-[520px]" aria-label="State and LGA boundary map" />
        {!located.length && <p className="absolute bottom-4 left-4 right-4 z-[500] border bg-card/95 p-3 text-sm text-eye-deep">{geo ? "No captured GPS locations in the selected reporting period." : "Loading Nigerian boundaries…"}</p>}
      </div>
      <aside className="space-y-4 px-4 lg:pl-0">
        <h3 className="text-sm font-bold text-eye-deep">Evidence layers</h3>
        <div className="space-y-1">{([
          ["reports", "Facility reporting", "bg-eye-blue"], ["cataract", "Cataract screened", "bg-eye-orange"], ["tt", "Trachomatous trichiasis", "bg-eye-rose"], ["heat", "Morbidity heatmap", "bg-eye-gold"], ["dust", "Dust-prone zones", "bg-eye-gold"], ["water", "Water access points", "bg-eye-teal"], ["wash", "WASH locations", "bg-eye-teal"], ["basemap", "Street basemap", "bg-muted-foreground"],
        ] as const).map(([key, label, swatch]) => <label key={key} className="flex min-h-10 cursor-pointer items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${swatch}`} />{label}</span><Switch aria-label={label} checked={visible[key]} onCheckedChange={(checked) => setVisible((v) => ({ ...v, [key]: checked }))} /></label>)}</div>
        <div className="space-y-2 border-y py-3 text-xs">
          <p className="flex items-center gap-2 font-semibold text-eye-teal"><Wind className="h-4 w-4" /><Droplets className="h-4 w-4" />Environmental evidence</p>
          <p className="text-muted-foreground">{environment.length ? `${environment.length} sourced features · this session only` : "No environmental dataset loaded. Dust exposure and water access are not inferred from case counts."}</p>
          <p className="text-muted-foreground">No validated blindness corridor model connected.</p>
          <input ref={fileInput} type="file" accept=".geojson,.json" className="hidden" aria-label="Environmental GeoJSON" onChange={async (event) => {
            const file = event.target.files?.[0]; if (!file) return;
            try { if (file.size > 5 * 1024 * 1024) throw new Error("Environmental file must be smaller than 5 MB."); setEnvironment(parseEnvironmentalEvidence(JSON.parse(await file.text())).features); setImportError(""); } catch (e) { setImportError(e instanceof Error ? e.message : "Could not read environmental evidence."); }
            event.target.value = "";
          }} />
          <Button variant="outline" size="sm" className="w-full" onClick={() => fileInput.current?.click()}><Upload className="mr-2 h-3.5 w-3.5" />Load environmental GeoJSON</Button>
          {!!environment.length && <Button variant="ghost" size="sm" onClick={() => setEnvironment([])}>Clear environmental evidence</Button>}
          {importError && <p role="alert" className="text-destructive">{importError}</p>}
        </div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-eye-deep"><Layers3 className="h-4 w-4 text-eye-teal" /> Map legend</h3>
        <div className="space-y-2 text-xs">
          <p className="flex items-center gap-2"><span className="w-7 border-t-[3px] border-eye-deep" />State boundary</p>
          <p className="flex items-center gap-2"><span className="w-7 border-t border-eye-blue" />LGA boundary</p>
          <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-eye-orange" />Cataract screening cluster</p>
          <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-dashed border-eye-rose" />TT screening cluster</p>
          <p className="flex gap-2"><span className="h-3 w-3 shrink-0 bg-eye-gold" />Heat: teal → yellow → orange → red; relative screening volume, not prevalence.</p>
          {metric === "outcome" ? <><p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-eye-teal" />Good ≥80%</p><p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-eye-gold" />Good 60–79.9%</p><p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-eye-rose" />Good &lt;60%</p><p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-muted-foreground" />Not assessed</p></> : <><p className="flex items-center gap-2"><span className="h-4 w-4 rounded-full bg-eye-blue" />Larger circle = more services</p><p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-eye-violet" />Zero services recorded</p></>}
          <p className="text-muted-foreground">Points mark where reports were captured, not verified facility premises. State/LGA are located from GPS. {metric === "outcome" ? "Outcome percentages use assessed eyes, both sexes." : "Service counts follow the dashboard sex filter."}</p>
        </div>
        {outside > 0 && <p className="flex gap-2 text-xs text-eye-orange"><AlertTriangle className="h-4 w-4 shrink-0" />{outside} GPS locations outside mapped Nigerian boundaries; not plotted.</p>}
        {active && tt ? <div className="space-y-2 border-t pt-4">
          <h3 className="font-bold text-eye-deep">{active.report.facility_name}</h3><p className="text-xs text-muted-foreground">{active.report.report_date} · {active.lga}, {active.state}</p>
          {active.report.state && active.report.state.toLowerCase() !== active.state?.toLowerCase() && <p className="text-xs text-eye-orange">Report lists {active.report.state}; GPS falls in {active.state}.</p>}
          <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Consulted</dt><dd className="text-right font-bold">{t(tt.consulted)}</dd><dt>Surgeries</dt><dd className="text-right font-bold">{t(tt.surgeries)}</dd><dt>Glasses</dt><dd className="text-right font-bold">{t(tt.glasses)}</dd><dt>Good discharge</dt><dd className="text-right font-bold">{c && vaTotal(c.discharge.presenting) ? `${pct(c.discharge.presenting.good, vaTotal(c.discharge.presenting))}%` : "Not assessed"}</dd></dl>
          <p className="break-words font-mono text-xs">{active.gps.lat.toFixed(6)}, {active.gps.lng.toFixed(6)}</p><p className="text-xs text-muted-foreground">Accuracy ±{Math.round(active.gps.accuracy)} m · {new Date(active.gps.captured_at).toLocaleString()}</p>
        </div> : <p className="border-t pt-4 text-xs text-muted-foreground">No reporting point selected.</p>}
      </aside>
    </div>
  </section>;
}