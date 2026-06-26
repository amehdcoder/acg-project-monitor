import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Home, MapPin, Loader2, Play, Pause } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Household Coverage Survey Map
 * ────────────────────────────────────────────────────────────────────────
 * Plots every household visit captured in the Coverage Evaluation 3D workflow
 * (`ces_household_visits`) at its exact GPS coordinate, using the same outcome
 * iconography as the survey screen:
 *   • Treated      → green check
 *   • Not Treated  → red circled ✗
 *   • Absent       → grey location pin
 *   • Refused      → dark-red shield
 *   • Ineligible   → orange warning ⚠
 *
 * The visited state boundary is drawn bold and bright over a satellite-style
 * basemap, and a Dengue-outbreak-style animated pulse sweeps the plotted
 * households to professionally simulate the community visits as they occurred.
 */

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

interface Outcome {
  key: string;
  label: string;
  color: string;
  /** Inline SVG glyph (white stroke/fill) drawn inside the coloured pin. */
  glyph: string;
}

const OUTCOMES: Record<string, Outcome> = {
  treated: {
    key: "treated", label: "Treated", color: "#16a34a",
    glyph: '<path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  not_treated: {
    key: "not_treated", label: "Not Treated", color: "#dc2626",
    glyph: '<circle cx="10" cy="10" r="6.2" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M7.6 7.6l4.8 4.8M12.4 7.6l-4.8 4.8" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>',
  },
  absent: {
    key: "absent", label: "Absent", color: "#64748b",
    glyph: '<path d="M10 4.5c-2.6 0-4.7 2.1-4.7 4.7 0 3.3 4.7 7.3 4.7 7.3s4.7-4 4.7-7.3C14.7 6.6 12.6 4.5 10 4.5z" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="10" cy="9.2" r="1.7" fill="#fff"/>',
  },
  refused: {
    key: "refused", label: "Refused", color: "#991b1b",
    glyph: '<path d="M10 4l4.5 1.8v3.4c0 3-2 5.3-4.5 6.3-2.5-1-4.5-3.3-4.5-6.3V5.8L10 4z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>',
  },
  ineligible: {
    key: "ineligible", label: "Ineligible", color: "#f59e0b",
    glyph: '<path d="M10 4.5l5.5 9.6H4.5L10 4.5z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 8.4v3.1M10 13.2v0.1" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
  },
};

const outcomeFor = (status?: string | null): Outcome =>
  OUTCOMES[norm(status)] || { key: "other", label: status || "Other", color: "#7c3aed", glyph: '<circle cx="10" cy="10" r="3" fill="#fff"/>' };

function pinIcon(o: Outcome, highlight = false): L.DivIcon {
  return L.divIcon({
    className: "hcs-pin",
    html: `<div class="hcs-pin-wrap${highlight ? " hcs-pin-live" : ""}">
      <svg width="30" height="38" viewBox="0 0 30 38">
        <path d="M15 37C15 37 28 22.5 28 14C28 6.3 22.2 1 15 1C7.8 1 2 6.3 2 14C2 22.5 15 37 15 37Z"
          fill="${o.color}" stroke="#ffffff" stroke-width="2"/>
        <g transform="translate(5,3)">${o.glyph}</g>
      </svg>
    </div>`,
    iconSize: [30, 38],
    iconAnchor: [15, 37],
    popupAnchor: [0, -34],
  });
}

interface VisitPoint {
  id: string;
  lat: number;
  lng: number;
  status: string;
  commodity: string | null;
  hh: string;
  community: string;
  state: string;
  at: string | null;
}

interface Props {
  projectId?: string | null;
  formName?: string;
  /** Optional state filter coming from the dashboard filter bar. */
  stateFilter?: string | null;
}

export default function HouseholdCoverageSurveyMap({ projectId, formName, stateFilter }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);
  const liveRef = useRef<L.Marker | null>(null);
  const geoRef = useRef<any[] | null>(null);
  const sweepTimer = useRef<number | null>(null);

  const [points, setPoints] = useState<VisitPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [animate, setAnimate] = useState(true);

  // ── Load household visits (project-scoped, joined to survey geography) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let sq = supabase.from("ces_surveys" as any).select("id,state,community_name,project_id");
        if (projectId) sq = sq.eq("project_id", projectId);
        const { data: surveys } = await sq;
        const meta = new Map<string, { state: string; community: string }>();
        for (const s of (surveys as any[]) || []) {
          meta.set(s.id, { state: s.state || "", community: s.community_name || "" });
        }
        const ids = [...meta.keys()];
        if (ids.length === 0) { if (!cancelled) { setPoints([]); setLoading(false); } return; }

        const collected: VisitPoint[] = [];
        const CHUNK = 200;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const { data: visits } = await supabase
            .from("ces_household_visits" as any)
            .select("id,survey_id,latitude,longitude,coverage_status,commodity,hh_number,visited_at")
            .in("survey_id", slice);
          for (const v of (visits as any[]) || []) {
            const lat = Number(v.latitude), lng = Number(v.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
            const m = meta.get(v.survey_id) || { state: "", community: "" };
            collected.push({
              id: v.id, lat, lng, status: v.coverage_status, commodity: v.commodity,
              hh: v.hh_number || "HH", community: m.community, state: m.state, at: v.visited_at,
            });
          }
        }
        if (!cancelled) { setPoints(collected); setLoading(false); }
      } catch (e) {
        console.warn("Household coverage map load failed", e);
        if (!cancelled) { setPoints([]); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const filtered = useMemo(
    () => (stateFilter ? points.filter((p) => norm(p.state) === norm(stateFilter)) : points),
    [points, stateFilter],
  );

  const statesPresent = useMemo(
    () => new Set(filtered.map((p) => norm(p.state)).filter(Boolean)),
    [filtered],
  );

  // ── Load Nigeria LGA boundaries once (for state outline) ──
  useEffect(() => {
    if (geoRef.current) { redraw(); return; }
    fetch("/nigeria-lga.geojson")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { geoRef.current = d.features || []; redraw(); })
      .catch((e) => console.warn("Boundaries failed", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Init map once ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, { zoomControl: true, attributionControl: false });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 19, keepBuffer: 6, updateWhenIdle: false,
    }).addTo(map);
    // Satellite imagery layer to match the Coverage Evaluation 3D look.
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, opacity: 0.92, keepBuffer: 6, updateWhenIdle: false,
    }).addTo(map);
    map.setView([9.6, 8.1], 6);
    mapRef.current = map;
    setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 60);
    redraw();
    return () => { try { map.remove(); } catch { /* noop */ } mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(redraw, [filtered, statesPresent]);

  function redraw() {
    const map = mapRef.current;
    if (!map) return;

    // ── Bold state boundary overlay ──
    if (boundaryLayerRef.current) { try { map.removeLayer(boundaryLayerRef.current); } catch { /* noop */ } }
    const bGroup = L.layerGroup();
    const bounds = L.latLngBounds([]);
    const feats = geoRef.current;
    if (feats && statesPresent.size) {
      const stateFeats = feats.filter((f: any) => statesPresent.has(norm(f?.properties?.state)));
      if (stateFeats.length) {
        // Dissolve-look: draw a thick glow underlay then a crisp bright outline.
        const glow = L.geoJSON({ type: "FeatureCollection", features: stateFeats } as any, {
          style: () => ({ color: "#22c55e", weight: 7, opacity: 0.25, fill: false }),
        });
        const outline = L.geoJSON({ type: "FeatureCollection", features: stateFeats } as any, {
          style: () => ({ color: "#22c55e", weight: 2.4, opacity: 0.95, fillColor: "#22c55e", fillOpacity: 0.06 }),
          onEachFeature: (f: any, lyr) => { try { bounds.extend((lyr as any).getBounds()); } catch { /* noop */ } },
        });
        bGroup.addLayer(glow);
        bGroup.addLayer(outline);
      }
    }
    bGroup.addTo(map);
    boundaryLayerRef.current = bGroup;

    // ── Household outcome markers ──
    if (markerLayerRef.current) { try { map.removeLayer(markerLayerRef.current); } catch { /* noop */ } }
    const mGroup = L.layerGroup();
    for (const p of filtered) {
      const o = outcomeFor(p.status);
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(o), riseOnHover: true }).bindPopup(
        `<div style="font-size:12px;min-width:140px">
          <strong>${p.hh}</strong> · <span style="color:${o.color};font-weight:600">${o.label}</span><br/>
          ${p.community ? `<span>${p.community}</span><br/>` : ""}
          ${p.commodity ? `<span>Commodity: ${p.commodity}</span><br/>` : ""}
          <span style="color:#64748b">${p.at ? new Date(p.at).toLocaleString() : ""}</span><br/>
          <span style="color:#64748b">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>
        </div>`,
      );
      mGroup.addLayer(m);
      try { bounds.extend([p.lat, p.lng]); } catch { /* noop */ }
    }
    mGroup.addTo(map);
    markerLayerRef.current = mGroup;

    try { if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 }); } catch { /* noop */ }
  }

  // ── Dengue-style animated sweep: a glowing pulse visits each household ──
  useEffect(() => {
    const map = mapRef.current;
    if (sweepTimer.current) { clearInterval(sweepTimer.current); sweepTimer.current = null; }
    if (liveRef.current) { try { map?.removeLayer(liveRef.current); } catch { /* noop */ } liveRef.current = null; }
    if (!map || !animate || filtered.length === 0) return;

    // Order points chronologically so the animation re-plays the field visits.
    const seq = [...filtered].sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
    let i = 0;
    const pulse = L.marker([seq[0].lat, seq[0].lng], {
      icon: L.divIcon({ className: "hcs-live", html: '<div class="hcs-live-ring"></div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      interactive: false, zIndexOffset: -50,
    }).addTo(map);
    liveRef.current = pulse;

    sweepTimer.current = window.setInterval(() => {
      i = (i + 1) % seq.length;
      pulse.setLatLng([seq[i].lat, seq[i].lng]);
    }, 1100);

    return () => {
      if (sweepTimer.current) { clearInterval(sweepTimer.current); sweepTimer.current = null; }
      if (liveRef.current) { try { map.removeLayer(liveRef.current); } catch { /* noop */ } liveRef.current = null; }
    };
  }, [animate, filtered]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of filtered) { const k = outcomeFor(p.status).key; c[k] = (c[k] || 0) + 1; }
    return c;
  }, [filtered]);

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-sm">
          <Home className="h-4 w-4 text-primary" /> Household Coverage Survey Map
        </CardTitle>
        <CardDescription className="text-xs">
          {formName ? `${formName} — ` : ""}Every household visit from Coverage Evaluation 3D, plotted at its captured GPS with its outcome icon.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1"><MapPin className="h-3 w-3" />{filtered.length} household{filtered.length === 1 ? "" : "s"}</Badge>
          {Object.values(OUTCOMES).map((o) => counts[o.key] ? (
            <span key={o.key} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
              style={{ borderColor: `${o.color}66`, color: o.color, background: `${o.color}12` }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />
              {o.label} · {counts[o.key]}
            </span>
          ) : null)}
          <button
            onClick={() => setAnimate((v) => !v)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {animate ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {animate ? "Pause visit replay" : "Play visit replay"}
          </button>
        </div>
        <div ref={containerRef} className="rounded-xl overflow-hidden border border-border" style={{ height: 520, width: "100%" }} />
        {!loading && filtered.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">
            No household visits captured yet for this project. They appear here as soon as Coverage Evaluation 3D surveys are submitted.
          </p>
        )}
        {loading && (
          <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading household visits…
          </p>
        )}
      </CardContent>
    </Card>
  );
}
