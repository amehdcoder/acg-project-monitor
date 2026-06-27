import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import "leaflet.heat";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Home, MapPin, Loader2, Play, Pause, SkipForward, SkipBack,
  Flame, Download, FileImage, FileText, RotateCcw,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Household Coverage Survey Map
 * ────────────────────────────────────────────────────────────────────────
 * Plots every household visit captured in the Coverage Evaluation 3D workflow
 * (`ces_household_visits`) at its exact GPS coordinate, using the same outcome
 * iconography as the survey screen. Features:
 *   • Marker clustering with automatic declustering on zoom (handles 1000s).
 *   • Visit-sweep animation with play/pause, speed, step-by-step and time sync.
 *   • Optional treated / not-treated density heatmap overlay.
 *   • Accessible, keyboard-navigable legend that doubles as an outcome filter.
 *   • One-click PNG / PDF export of the current view with legend + filters.
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

const OTHER: Outcome = { key: "other", label: "Other", color: "#7c3aed", glyph: '<circle cx="10" cy="10" r="3" fill="#fff"/>' };

const outcomeFor = (status?: string | null): Outcome => OUTCOMES[norm(status)] || OTHER;

function pinIcon(o: Outcome): L.DivIcon {
  return L.divIcon({
    className: "hcs-pin",
    html: `<div class="hcs-pin-wrap">
      <svg width="30" height="38" viewBox="0 0 30 38" role="img" aria-label="${o.label}">
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
  /** Optional date-time range (ISO strings) synced from dashboard filters. */
  dateFrom?: string | null;
  dateTo?: string | null;
}

const SPEEDS = [0.5, 1, 2, 4];

export default function HouseholdCoverageSurveyMap({ projectId, formName, stateFilter, dateFrom, dateTo }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<any>(null);
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);
  const heatRef = useRef<any>(null);
  const liveRef = useRef<L.Marker | null>(null);
  const geoRef = useRef<any[] | null>(null);
  const sweepTimer = useRef<number | null>(null);

  const [points, setPoints] = useState<VisitPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Animation state
  const [animate, setAnimate] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [sweepIndex, setSweepIndex] = useState(0);

  // Heatmap state
  const [heatOn, setHeatOn] = useState(false);
  const [heatMetric, setHeatMetric] = useState<"all" | "treated" | "not_treated">("all");

  // Legend / outcome filter (keyboard accessible)
  const [activeOutcomes, setActiveOutcomes] = useState<Set<string>>(new Set());

  // Internal visit time-window (index into chronological sequence)
  const [timeWindow, setTimeWindow] = useState<[number, number] | null>(null);

  const [exporting, setExporting] = useState(false);

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

  // Apply state + dashboard date filters + legend outcome filter
  const filtered = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() : null;
    return points.filter((p) => {
      if (stateFilter && norm(p.state) !== norm(stateFilter)) return false;
      if (activeOutcomes.size && !activeOutcomes.has(outcomeFor(p.status).key)) return false;
      if (fromTs || toTs) {
        const t = p.at ? new Date(p.at).getTime() : null;
        if (t == null) return false;
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      return true;
    });
  }, [points, stateFilter, activeOutcomes, dateFrom, dateTo]);

  // Chronological sequence used by the sweep + time window slider
  const sequence = useMemo(
    () => [...filtered].sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime()),
    [filtered],
  );

  // Reset the internal time window whenever the data set changes
  useEffect(() => {
    setTimeWindow(sequence.length ? [0, sequence.length - 1] : null);
    setSweepIndex(0);
  }, [sequence.length]);

  // Points visible after the internal time-window is applied
  const windowed = useMemo(() => {
    if (!timeWindow) return sequence;
    const [a, b] = timeWindow;
    return sequence.slice(a, b + 1);
  }, [sequence, timeWindow]);

  const statesPresent = useMemo(
    () => new Set(windowed.map((p) => norm(p.state)).filter(Boolean)),
    [windowed],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of windowed) { const k = outcomeFor(p.status).key; c[k] = (c[k] || 0) + 1; }
    return c;
  }, [windowed]);

  // All outcome rows for the legend (known outcomes + any "other" present)
  const legendItems = useMemo(() => {
    const base = Object.values(OUTCOMES);
    return counts[OTHER.key] ? [...base, OTHER] : base;
  }, [counts]);

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
    // Clean light "state map" basemap (matches the LGA Supervision Map) so the
    // coloured household-outcome pins read clearly against the state boundary —
    // no satellite imagery underneath.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 19, keepBuffer: 6, updateWhenIdle: false, crossOrigin: true,
    }).addTo(map);
    map.setView([9.6, 8.1], 6);

    // Clustering group with an outcome-aware cluster icon.
    const cluster = (L as any).markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 55,
      iconCreateFunction: (c: any) => {
        const children = c.getAllChildMarkers();
        const tally: Record<string, number> = {};
        for (const m of children) { const k = (m as any).__outcome || OTHER.key; tally[k] = (tally[k] || 0) + 1; }
        const total = children.length;
        const dim = total > 100 ? 56 : total > 25 ? 46 : 38;
        // Build a conic-gradient ring proportional to outcome mix.
        let acc = 0;
        const segs = Object.entries(tally).map(([k, n]) => {
          const o = OUTCOMES[k] || OTHER;
          const start = (acc / total) * 360; acc += n;
          const end = (acc / total) * 360;
          return `${o.color} ${start}deg ${end}deg`;
        });
        return L.divIcon({
          html: `<div class="hcs-cluster" style="width:${dim}px;height:${dim}px;background:conic-gradient(${segs.join(",")})">
            <span class="hcs-cluster-core">${total}</span>
          </div>`,
          className: "hcs-cluster-wrap",
          iconSize: L.point(dim, dim),
        });
      },
    });
    cluster.addTo(map);
    clusterRef.current = cluster;

    mapRef.current = map;
    setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 60);
    redraw();
    return () => { try { map.remove(); } catch { /* noop */ } mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(redraw, [windowed, statesPresent]);

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

    // ── Household outcome markers (clustered) ──
    const cluster = clusterRef.current;
    if (cluster) {
      cluster.clearLayers();
      const markers: L.Marker[] = [];
      for (const p of windowed) {
        const o = outcomeFor(p.status);
        const m = L.marker([p.lat, p.lng], { icon: pinIcon(o), riseOnHover: true, keyboard: true });
        (m as any).__outcome = o.key;
        m.bindTooltip(`${p.hh} — ${o.label}${p.community ? ` · ${p.community}` : ""}`, { direction: "top", offset: [0, -32] });
        m.bindPopup(
          `<div style="font-size:12px;min-width:140px">
            <strong>${p.hh}</strong> · <span style="color:${o.color};font-weight:600">${o.label}</span><br/>
            ${p.community ? `<span>${p.community}</span><br/>` : ""}
            ${p.commodity ? `<span>Commodity: ${p.commodity}</span><br/>` : ""}
            <span style="color:#64748b">${p.at ? new Date(p.at).toLocaleString() : ""}</span><br/>
            <span style="color:#64748b">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>
          </div>`,
        );
        markers.push(m);
        try { bounds.extend([p.lat, p.lng]); } catch { /* noop */ }
      }
      cluster.addLayers(markers);
    }

    try { if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 }); } catch { /* noop */ }
  }

  // ── Heatmap overlay ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (heatRef.current) { try { map.removeLayer(heatRef.current); } catch { /* noop */ } heatRef.current = null; }
    if (!heatOn) return;
    const pts = windowed
      .filter((p) => heatMetric === "all" || outcomeFor(p.status).key === heatMetric)
      .map((p) => [p.lat, p.lng, 0.8] as [number, number, number]);
    if (!pts.length) return;
    const gradient =
      heatMetric === "not_treated"
        ? { 0.2: "#fee2e2", 0.5: "#f87171", 1: "#b91c1c" }
        : heatMetric === "treated"
        ? { 0.2: "#dcfce7", 0.5: "#4ade80", 1: "#15803d" }
        : { 0.2: "#dbeafe", 0.5: "#fbbf24", 1: "#ef4444" };
    heatRef.current = (L as any).heatLayer(pts, { radius: 28, blur: 22, maxZoom: 15, gradient });
    heatRef.current.addTo(map);
    return () => { if (heatRef.current) { try { map.removeLayer(heatRef.current); } catch { /* noop */ } heatRef.current = null; } };
  }, [heatOn, heatMetric, windowed]);

  // ── Visit sweep: glowing pulse that walks the chronological sequence ──
  const placePulse = useCallback((idx: number) => {
    const map = mapRef.current;
    if (!map || !windowed.length) return;
    const p = windowed[Math.min(idx, windowed.length - 1)];
    if (!p) return;
    if (!liveRef.current) {
      liveRef.current = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: "hcs-live", html: '<div class="hcs-live-ring"></div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
        interactive: false, zIndexOffset: 600,
      }).addTo(map);
    } else {
      liveRef.current.setLatLng([p.lat, p.lng]);
    }
  }, [windowed]);

  useEffect(() => {
    const map = mapRef.current;
    if (sweepTimer.current) { clearInterval(sweepTimer.current); sweepTimer.current = null; }
    if (!map || !animate || windowed.length === 0) {
      if (!animate && liveRef.current) { try { map?.removeLayer(liveRef.current); } catch { /* noop */ } liveRef.current = null; }
      return;
    }
    placePulse(sweepIndex);
    sweepTimer.current = window.setInterval(() => {
      setSweepIndex((i) => {
        const next = (i + 1) % windowed.length;
        placePulse(next);
        return next;
      });
    }, Math.max(120, 1100 / speed));
    return () => { if (sweepTimer.current) { clearInterval(sweepTimer.current); sweepTimer.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, speed, windowed]);

  const step = (dir: 1 | -1) => {
    setAnimate(false);
    setSweepIndex((i) => {
      const n = (i + dir + windowed.length) % Math.max(1, windowed.length);
      placePulse(n);
      const p = windowed[n];
      if (p && mapRef.current) mapRef.current.panTo([p.lat, p.lng]);
      return n;
    });
  };

  const toggleOutcome = (key: string) => {
    setActiveOutcomes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── Export current view (with legend + filters) to PNG / PDF ──
  const exportView = async (format: "png" | "pdf") => {
    if (!captureRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false,
      });
      const stamp = Date.now();
      const base = `household-coverage-map-${stamp}`;
      if (format === "png") {
        const link = document.createElement("a");
        link.download = `${base}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } else {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? "landscape" : "portrait",
          unit: "px", format: [canvas.width, canvas.height],
        });
        pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
        pdf.save(`${base}.pdf`);
      }
      toast.success(`Map exported as ${format.toUpperCase()}`);
    } catch (e) {
      console.error("Map export failed", e);
      toast.error("Failed to export map view");
    } finally {
      setExporting(false);
    }
  };

  const currentVisit = windowed[Math.min(sweepIndex, Math.max(0, windowed.length - 1))];

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-sm">
              <Home className="h-4 w-4 text-primary" /> Household Coverage Survey Map
            </CardTitle>
            <CardDescription className="text-xs">
              {formName ? `${formName} — ` : ""}Every household visit from Coverage Evaluation 3D, clustered and plotted at its captured GPS with its outcome icon.
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={exporting} aria-label="Export map view">
                {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportView("png")}>
                <FileImage className="h-4 w-4 mr-2" /> Export as PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportView("pdf")}>
                <FileText className="h-4 w-4 mr-2" /> Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Summary badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <MapPin className="h-3 w-3" />{windowed.length} household{windowed.length === 1 ? "" : "s"}
          </Badge>
          {(stateFilter || dateFrom || dateTo) && (
            <Badge variant="outline" className="gap-1 text-[11px]">
              Filters: {[stateFilter, dateFrom && `from ${new Date(dateFrom).toLocaleDateString()}`, dateTo && `to ${new Date(dateTo).toLocaleDateString()}`].filter(Boolean).join(" · ")}
            </Badge>
          )}
        </div>

        {/* Accessible, keyboard-navigable legend (also acts as outcome filter) */}
        <div role="group" aria-label="Household outcome legend and filters" className="flex flex-wrap items-center gap-2">
          {legendItems.map((o) => {
            const active = activeOutcomes.size === 0 || activeOutcomes.has(o.key);
            const n = counts[o.key] || 0;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => toggleOutcome(o.key)}
                aria-pressed={activeOutcomes.has(o.key)}
                aria-label={`${o.label}: ${n} household${n === 1 ? "" : "s"}. ${activeOutcomes.has(o.key) ? "Active filter, activate to remove." : "Activate to filter by this outcome."}`}
                title={`${o.label} · ${n}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${active ? "" : "opacity-40"}`}
                style={{ borderColor: `${o.color}66`, color: o.color, background: `${o.color}12` }}
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full" style={{ background: o.color }}>
                  <svg width="12" height="12" viewBox="2 2 16 16" aria-hidden="true">{<g dangerouslySetInnerHTML={{ __html: o.glyph }} />}</svg>
                </span>
                {o.label}
                <span className="rounded-full bg-background/70 px-1.5 font-semibold tabular-nums">{n}</span>
              </button>
            );
          })}
          {activeOutcomes.size > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setActiveOutcomes(new Set())}>
              <RotateCcw className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Animation + heatmap controls */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-2.5">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => step(-1)} aria-label="Previous visit" disabled={!windowed.length}>
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnimate((v) => !v)} aria-label={animate ? "Pause visit replay" : "Play visit replay"} disabled={!windowed.length}>
              {animate ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => step(1)} aria-label="Next visit" disabled={!windowed.length}>
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5" role="group" aria-label="Replay speed">
            <span className="text-[11px] font-medium text-muted-foreground">Speed</span>
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${speed === s ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`}
              >
                {s}×
              </button>
            ))}
          </div>

          {currentVisit && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              Step {Math.min(sweepIndex + 1, windowed.length)} / {windowed.length}
              {currentVisit.at ? ` · ${new Date(currentVisit.at).toLocaleString()}` : ""}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Flame className={`h-3.5 w-3.5 ${heatOn ? "text-orange-500" : "text-muted-foreground"}`} />
            <span className="text-[11px] font-medium">Heatmap</span>
            <Switch checked={heatOn} onCheckedChange={setHeatOn} aria-label="Toggle density heatmap" />
            {heatOn && (
              <div className="flex items-center gap-1" role="group" aria-label="Heatmap metric">
                {(["all", "treated", "not_treated"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setHeatMetric(m)}
                    aria-pressed={heatMetric === m}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${heatMetric === m ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`}
                  >
                    {m === "all" ? "Density" : m === "treated" ? "Treated" : "Not Treated"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Visit time-window slider (synced with the chronological sequence) */}
        {sequence.length > 1 && timeWindow && (
          <div className="space-y-1 px-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{sequence[timeWindow[0]]?.at ? new Date(sequence[timeWindow[0]].at!).toLocaleDateString() : "Start"}</span>
              <span>Visit time window</span>
              <span>{sequence[timeWindow[1]]?.at ? new Date(sequence[timeWindow[1]].at!).toLocaleDateString() : "End"}</span>
            </div>
            <Slider
              min={0}
              max={sequence.length - 1}
              step={1}
              value={timeWindow}
              onValueChange={(v) => setTimeWindow([v[0], v[1] ?? v[0]] as [number, number])}
              aria-label="Visit time window"
            />
          </div>
        )}

        {/* Captured area: map + overlaid legend so exports include it */}
        <div ref={captureRef} className="relative rounded-xl overflow-hidden border border-border">
          <div ref={containerRef} style={{ height: 520, width: "100%" }} />
          {/* On-map legend overlay (always captured in export) */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg border border-border bg-card/95 p-2 shadow-card backdrop-blur-sm">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Outcomes</p>
            <ul className="space-y-0.5">
              {legendItems.map((o) => (
                <li key={o.key} className="flex items-center gap-1.5 text-[11px]">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />
                  <span className="text-foreground">{o.label}</span>
                  <span className="ml-auto font-semibold tabular-nums text-muted-foreground">{counts[o.key] || 0}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {!loading && windowed.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">
            No household visits captured yet for this project / filters. They appear here as soon as Coverage Evaluation 3D surveys are submitted.
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
