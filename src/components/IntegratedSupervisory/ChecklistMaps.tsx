/**
 * Geospatial panels for the Integrated Supervisory Checklist.
 *
 *  • Map 1 — communities visited, coloured by Status of MDA
 *      (Not Started = red, Ongoing = blue, Halted = yellow, Completed = green)
 *  • Map 2 — households / classes, green tick where the respondent was OFFERED
 *      the medicine(s), red cross where they were not.
 *
 * Both maps draw Nigeria's administrative boundaries and clip/zoom to the
 * State → LGA → Ward currently selected in the shared dashboard filter bar.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users } from "lucide-react";
import { loadNigeriaGeo, lgaKey } from "@/components/Dashboard/ops/lgaGeo";
import { resolveChecklistValue } from "./checklistSchema";
import type { ChecklistFilterState } from "./ChecklistFilters";

type Row = Record<string, unknown>;

const s = (v: unknown) => String(v ?? "").trim();
const lbl = (field: string, v: unknown) => s(resolveChecklistValue(field, v) || v);
const clean = (v: unknown) => s(v).toLowerCase().replace(/[^a-z0-9]/g, "");

const esc = (v: unknown) =>
  s(v).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/* --------------------------------------------------------------------- GPS */

function parsePoint(v: unknown): { lat: number; lng: number } | null {
  if (!v) return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const lat = Number(o.lat ?? o.latitude);
    const lng = Number(o.long ?? o.lon ?? o.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }
  const p = s(v).split(/[\s,]+/).map(Number);
  if (p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  if (p[0] === 0 && p[1] === 0) return null;
  return { lat: p[0], lng: p[1] };
}

/* ------------------------------------------------------------- status hues */

export const STATUS_COLORS: { match: RegExp; color: string; label: string }[] = [
  { match: /complete/i, color: "#16a34a", label: "Completed" },
  { match: /not\s*start|no[t]?\s*commenc|yet\s*to/i, color: "#dc2626", label: "Not Started" },
  { match: /halt|stopp|suspend|paus/i, color: "#eab308", label: "Halted" },
  { match: /ongoing|on-?going|progress|started|commenc/i, color: "#2563eb", label: "Ongoing" },
];
const statusColor = (name: string) =>
  STATUS_COLORS.find((c) => c.match.test(name))?.color ?? "#64748b";

/** Independent monitor name when available, otherwise the designation. */
function collector(row: Row): { label: string; value: string } {
  const monitor = lbl("Independent_Monitor_s_Name", row.Independent_Monitor_s_Name);
  if (monitor && !/^n\/?a$/i.test(monitor)) return { label: "Independent Monitor", value: monitor };
  const desig = lbl("Designation", row.Designation);
  return { label: "Designation", value: desig || "—" };
}

/* ------------------------------------------------------------------ marker */

interface Pt {
  lat: number; lng: number;
  color: string;
  kind: "dot" | "tick" | "cross";
  popup: string;
}

function markerIcon(p: Pt): L.DivIcon {
  if (p.kind === "dot") {
    return L.divIcon({
      className: "",
      html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${p.color};border:2px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,.45)"></span>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }
  const glyph = p.kind === "tick"
    ? '<path d="M4 10.5l3.4 3.5L16 5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<path d="M5 5l10 10M15 5L5 15" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>';
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;background:${p.color};border:1.5px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,.45)"><svg viewBox="0 0 20 20" width="16" height="16">${glyph}</svg></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/* --------------------------------------------------------------------- map */

function GeoMap({
  points, filters, height = 460,
}: { points: Pt[]; filters: ChecklistFilterState; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const boundaryRef = useRef<L.GeoJSON | null>(null);
  const markerRef = useRef<L.LayerGroup | null>(null);
  const [geo, setGeo] = useState<any | null>(null);
  const [ready, setReady] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadNigeriaGeo().then((d) => { if (!cancelled) setGeo(d); }).catch(() => { /* boundaries optional */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const init = () => {
      if (mapRef.current) return;
      const map = L.map(el, { zoomControl: true, attributionControl: false, minZoom: 3, maxZoom: 18 });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd", maxZoom: 19, opacity: 0.95,
      }).addTo(map);
      map.setView([9.082, 8.6753], 6);
      mapRef.current = map;
      markerRef.current = L.layerGroup().addTo(map);
      setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 0);
      setReady((t) => t + 1);
    };
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      const ro = new ResizeObserver(() => {
        if (el.clientWidth > 0 && el.clientHeight > 0) { init(); ro.disconnect(); }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
    init();
  }, []);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  // Administrative boundaries — restricted to the filtered admin unit.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo) return;
    if (boundaryRef.current) { try { map.removeLayer(boundaryRef.current); } catch { /* noop */ } }

    const wantState = clean(filters.state);
    const wantLga = clean(filters.lga);
    const scoped = !!wantState;

    const inScope = (f: any) => {
      if (!wantState) return true;
      const k = lgaKey(f?.properties?.state, f?.properties?.lga);
      const [st, lg] = k.split("|");
      const stateWanted = lgaKey(filters.state, "").split("|")[0];
      if (st !== stateWanted) return false;
      if (wantLga && !(lg === wantLga || lg.startsWith(wantLga) || wantLga.startsWith(lg))) return false;
      return true;
    };

    const bounds = L.latLngBounds([]);
    const layer = L.geoJSON(geo, {
      filter: (f: any) => (scoped ? inScope(f) : true),
      style: (f: any) => ({
        fillColor: "#e2e8f0",
        fillOpacity: scoped ? 0.25 : 0.1,
        color: scoped ? "#0f172a" : "#94a3b8",
        weight: scoped ? 1.6 : 0.5,
        opacity: 1,
      }) as L.PathOptions,
      onEachFeature: (f: any, lyr: L.Layer) => {
        const st = s(f?.properties?.state), lg = s(f?.properties?.lga);
        (lyr as L.Path).bindTooltip(`${lg}${st ? `, ${st}` : ""}`, { sticky: true, direction: "top" });
        try { bounds.extend((lyr as any).getBounds()); } catch { /* noop */ }
      },
    });
    layer.addTo(map);
    layer.bringToBack();
    boundaryRef.current = layer;

    requestAnimationFrame(() => {
      try {
        map.invalidateSize();
        const ptBounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
        // Ward filter has no boundary file — zoom to the ward's points instead.
        const target = filters.ward && ptBounds.isValid()
          ? ptBounds
          : bounds.isValid() ? bounds : ptBounds;
        if (target.isValid()) map.fitBounds(target, { padding: [22, 22], maxZoom: 15 });
        else map.setView([9.082, 8.6753], 6);
      } catch { /* noop */ }
    });
  }, [geo, ready, filters.state, filters.lga, filters.ward, points]);

  // Data markers
  useEffect(() => {
    const group = markerRef.current;
    if (!group) return;
    group.clearLayers();
    for (const p of points) {
      L.marker([p.lat, p.lng], { icon: markerIcon(p) })
        .bindPopup(p.popup, { maxWidth: 300 })
        .addTo(group);
    }
  }, [points, ready]);

  useEffect(() => {
    const fix = () => { try { mapRef.current?.invalidateSize(); } catch { /* noop */ } };
    const timers = [setTimeout(fix, 200), setTimeout(fix, 800)];
    window.addEventListener("resize", fix);
    return () => { timers.forEach(clearTimeout); window.removeEventListener("resize", fix); };
  }, [geo]);

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full rounded-md overflow-hidden" style={{ height }} />
      {points.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow">
            No GPS coordinates in the current filter
          </span>
        </div>
      )}
    </div>
  );
}

const Legend = ({ items }: { items: { color: string; label: string; glyph?: string }[] }) => (
  <div className="flex flex-wrap items-center gap-3 text-[10px] font-medium text-muted-foreground">
    {items.map((i) => (
      <span key={i.label} className="flex items-center gap-1">
        <span
          className="flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] font-bold text-white"
          style={{ background: i.color }}
        >{i.glyph ?? ""}</span>
        {i.label}
      </span>
    ))}
  </div>
);

/* -------------------------------------------------------------------- main */

export default function ChecklistMaps({
  parents, respondents, filters,
}: { parents: Row[]; respondents: Row[]; filters: ChecklistFilterState }) {
  const communityPoints = useMemo<Pt[]>(() => {
    const out: Pt[] = [];
    const seen = new Set<string>();
    for (const p of parents) {
      const g = parsePoint(p.GPS ?? p._geolocation);
      if (!g) continue;
      const status = lbl("Status_of_MDA", p.Status_of_MDA) || "Unspecified";
      const key = `${clean(p.State)}|${clean(p.LGA)}|${clean(p.Ward)}|${clean(p.COMMUNITIES)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const who = collector(p);
      out.push({
        lat: g.lat, lng: g.lng, kind: "dot", color: statusColor(status),
        popup: `<div style="font-size:12px;line-height:1.5">
          <strong>${esc(p.COMMUNITIES) || "—"}</strong><br/>
          <span style="color:${statusColor(status)};font-weight:600">${esc(status)}</span><br/>
          State: ${esc(p.State) || "—"}<br/>LGA: ${esc(p.LGA) || "—"}<br/>
          Ward: ${esc(p.Ward) || "—"}<br/>FLHF: ${esc(p.FLHF) || "—"}<br/>
          ${esc(who.label)}: <strong>${esc(who.value)}</strong><br/>
          Visited: ${esc(s(p._submission_time).slice(0, 10)) || "—"}
        </div>`,
      });
    }
    return out;
  }, [parents]);

  const householdPoints = useMemo<Pt[]>(() => {
    const out: Pt[] = [];
    for (const r of respondents) {
      const g = parsePoint(r.GPS_of_Household);
      if (!g) continue;
      const offeredLabel = lbl("Were_you_OFFERED_the_medicine_s", r.Were_you_OFFERED_the_medicine_s);
      const offered = /^yes/i.test(offeredLabel);
      const who = collector(r);
      out.push({
        lat: g.lat, lng: g.lng,
        kind: offered ? "tick" : "cross",
        color: offered ? "#16a34a" : "#dc2626",
        popup: `<div style="font-size:12px;line-height:1.5">
          <strong>${esc(r.COMMUNITIES) || "Household"}</strong><br/>
          Offered medicine(s): <strong style="color:${offered ? "#16a34a" : "#dc2626"}">${esc(offeredLabel) || "—"}</strong><br/>
          Swallowed: ${esc(lbl("swallow", r.swallow)) || "—"}<br/>
          State: ${esc(r.State) || "—"}<br/>LGA: ${esc(r.LGA) || "—"}<br/>
          Ward: ${esc(r.Ward) || "—"}<br/>FLHF: ${esc(r.FLHF) || "—"}<br/>
          ${esc(who.label)}: <strong>${esc(who.value)}</strong>
        </div>`,
      });
    }
    return out;
  }, [respondents]);

  const scope = [filters.ward, filters.lga, filters.state].filter(Boolean)[0] || "Nigeria";

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b bg-muted/40 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-primary" /> Communities Visited · Status of MDA
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">{communityPoints.length} community point(s) · {scope}</Badge>
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          <GeoMap points={communityPoints} filters={filters} />
          <Legend items={STATUS_COLORS.map((c) => ({ color: c.color, label: c.label }))} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b bg-muted/40 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-primary" /> Households / Classes · Medicine Offered
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">{householdPoints.length} household point(s) · {scope}</Badge>
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          <GeoMap points={householdPoints} filters={filters} />
          <Legend items={[
            { color: "#16a34a", label: "Offered the medicine(s)", glyph: "✓" },
            { color: "#dc2626", label: "Not offered", glyph: "✕" },
          ]} />
        </CardContent>
      </Card>
    </div>
  );
}
