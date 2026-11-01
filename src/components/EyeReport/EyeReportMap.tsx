import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, MapPinned, Layers3, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadNigeriaGeo } from "@/components/Dashboard/ops/lgaGeo";
import { locatedReports, MAP_METRICS, mapValue, type MapMetric, type BoundaryFeature } from "@/lib/eyeReport/mapModel";
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
  const [state, setState] = useState("auto");
  const [metric, setMetric] = useState<MapMetric>("consulted");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([loadNigeriaGeo(), fetch("/eye-state-boundaries.geojson").then((r) => { if (!r.ok) throw new Error(); return r.json(); })])
      .then(([g, o]) => { if (live) { setGeo(g); setOutlines(o); } }).catch(() => { if (live) setError("State and LGA boundaries could not be loaded. Reconnect and reopen the dashboard."); });
    return () => { live = false; };
  }, []);
  const located = useMemo(() => locatedReports(rows, geo?.features ?? []), [rows, geo]);
  const states = useMemo(() => [...new Set(located.flatMap((r) => r.state ? [r.state] : []))].sort(), [located]);
  const activeState = state !== "auto" && states.includes(state) ? state : located.find((r) => r.state)?.state ?? null;
  const points = located.filter((r) => r.state === activeState);
  const active = points.find((r) => r.report.id === selected);
  useEffect(() => {
    if (!root.current) return;
    const instance = L.map(root.current, { preferCanvas: false, scrollWheelZoom: false, minZoom: 4, maxZoom: 19 }).setView([9.082, 8.6753], 6);
    instance.attributionControl.addAttribution("Nigeria administrative boundaries · GADM");
    map.current = instance;
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false })); observer.observe(root.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !geo || !outlines) return;
    const layers = L.layerGroup().addTo(instance);
    const features = geo.features.filter((f) => !activeState || f.properties.state === activeState);
    const shade = (value: number | null) => value === null ? "muted-foreground" : metric === "outcome" ? value >= 80 ? "eye-teal" : value >= 60 ? "eye-gold" : "eye-rose" : value <= 0 ? "eye-violet" : "eye-blue";
    const lgaLayer = L.geoJSON({ type: "FeatureCollection", features } as any, {
      style: (f) => {
        const reported = points.some((p) => p.lga === f?.properties.lga);
        return { color: token("eye-blue"), weight: 1.2, opacity: 0.75, fillColor: token(reported ? "eye-mint" : "eye-sky"), fillOpacity: 0.85 };
      },
      onEachFeature: (f, layer) => {
        const tooltip = text("div", `${f.properties.lga} · ${f.properties.state}`);
        layer.bindTooltip(tooltip, { sticky: true });
        layer.on("click", () => { const b = (layer as L.Polygon).getBounds(); if (b.isValid()) instance.fitBounds(b, { padding: [24, 24], maxZoom: 12 }); });
      },
    }).addTo(layers);
    L.geoJSON(outlines, { filter: (f) => !activeState || f.properties.state === activeState,
      style: { color: token("eye-deep"), weight: 3, fill: false, interactive: false } }).addTo(layers);
    const max = Math.max(1, ...points.map((p) => mapValue(p.report, metric, sex) ?? 0));
    for (const p of points) {
      const value = mapValue(p.report, metric, sex);
      const popup = document.createElement("div"); popup.className = "space-y-1 text-eye-ink";
      popup.append(text("strong", p.report.facility_name), text("p", `${p.report.report_date} · ${p.lga ?? "Unmatched LGA"}`), text("p", `${MAP_METRICS.find((m) => m.key === metric)?.label}: ${value === null ? "Not assessed" : metric === "outcome" ? `${value.toFixed(1)}%` : value.toLocaleString()}`), text("p", `${p.gps.lat.toFixed(6)}, ${p.gps.lng.toFixed(6)} · ±${Math.round(p.gps.accuracy)} m`));
      const circle = L.circleMarker([p.gps.lat, p.gps.lng], { radius: metric === "outcome" ? 10 : 7 + Math.sqrt((value ?? 0) / max) * 13,
        color: token("eye-paper"), weight: 2.5, fillColor: token(shade(value)), fillOpacity: 0.9 }).addTo(layers);
      circle.bindPopup(popup).bindTooltip(text("div", `${p.report.facility_name} · ${p.report.report_date}`));
      circle.on("click", () => setSelected(p.report.id));
    }
    const b = lgaLayer.getBounds(); bounds.current = b;
    if (b.isValid()) instance.fitBounds(b, { padding: [16, 16] });
    return () => { instance.removeLayer(layers); };
  }, [geo, outlines, activeState, located, metric, sex]);
  const c = active ? normCsom(active.report.csom) : null;
  const tt = active ? totals(normSummary(active.report.summary)) : null;
  const outside = located.filter((p) => !p.state).length;
  return <section className="border-y border-eye-blue/20 bg-card py-5" aria-label="Eye Health reporting location map">
    <div className="flex flex-wrap items-start justify-between gap-4 px-4">
      <div><p className="text-xs font-bold uppercase tracking-wider text-eye-teal">Eye care · Geographic evidence</p><h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-eye-deep"><MapPinned className="h-5 w-5" />{activeState ? `${activeState} reporting locations` : "Nigeria reporting locations"}</h2><p className="mt-1 text-xs text-muted-foreground">{located.length} / {rows.length} reports with GPS · {points.length} in this State · {rows.length - located.length} without GPS</p></div>
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
        <h3 className="flex items-center gap-2 text-sm font-bold text-eye-deep"><Layers3 className="h-4 w-4 text-eye-teal" /> Map legend</h3>
        <div className="space-y-2 text-xs">
          <p className="flex items-center gap-2"><span className="w-7 border-t-[3px] border-eye-deep" />State boundary</p>
          <p className="flex items-center gap-2"><span className="w-7 border-t border-eye-blue" />LGA boundary</p>
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