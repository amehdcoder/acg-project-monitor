import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Home, MapPin, Loader2, RotateCcw, AlertTriangle, Layers, Satellite,
  ShieldCheck, TrendingDown, TrendingUp, Target, Sigma, Crosshair, Radar,
  Download, FileText, FileSpreadsheet, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { exportDashboardPdf } from "@/lib/mda/dashboardPdf";
import { toCsv, downloadCsv } from "@/lib/mda/csvExport";

/**
 * Household Survey Coverage Map
 * ────────────────────────────────────────────────────────────────────────
 * Plots every household captured in the **Repeat Household Coverage Survey**
 * (`household_coverage_surveys.households[]`) at its unique GPS coordinate.
 *
 *   • GREEN  — therapeutic coverage achieved (≥1 eligible person swallowed).
 *   • RED    — no therapeutic coverage (nobody in the household swallowed).
 *
 * Beneath the map sits a robust geospatial read-out: therapeutic coverage with
 * a 95% Wilson confidence interval, coverage by geography, spatial spread and
 * automatic cold-spot detection — each with a plain-language interpretation.
 */

const GREEN = "#16a34a";
const RED = "#dc2626";
const AMBER = "#f59e0b";
const SLATE = "#64748b";

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const stripTags = (s: unknown) => String(s ?? "").replace(/<[^>]*>/g, "").trim();
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

/* ─── record shape (mirrors RepeatHouseholdCoverageSurvey) ─── */
interface PersonRow { offered?: string; swallowed?: string }
interface HouseholdRecord {
  household_no?: number;
  anyone_treated?: string;
  offered_count?: number;
  swallowed_count?: number;
  people?: PersonRow[];
  gps?: { lat?: number; lng?: number; accuracy?: number } | null;
}
interface SurveyRow {
  id: string;
  state: string | null;
  lga: string | null;
  ward: string | null;
  community_name: string | null;
  households: HouseholdRecord[] | null;
  created_at: string;
}

const personsOffered = (h: HouseholdRecord) =>
  Math.max(Number(h.offered_count) || 0, (h.people || []).filter((p) => norm(p.offered) === "y").length);
const personsSwallowed = (h: HouseholdRecord) =>
  Math.max(Number(h.swallowed_count) || 0, (h.people || []).filter((p) => norm(p.swallowed) === "y").length);

interface HHPoint {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  treated: boolean;      // therapeutic coverage achieved
  offered: number;
  swallowed: number;
  coverage: number;      // % swallowed / offered
  hh: string;
  community: string;
  ward: string;
  lga: string;
  state: string;
  at: string | null;
}

function validGps(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  if (la === 0 && ln === 0) return null;
  return { lat: la, lng: ln };
}

/* ─── Wilson 95% CI for a proportion ─── */
function wilson(success: number, total: number): { p: number; lo: number; hi: number } {
  if (total === 0) return { p: 0, lo: 0, hi: 0 };
  const z = 1.96, p = success / total, n = total;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { p: p * 100, lo: (Math.max(0, (centre - margin) / d)) * 100, hi: (Math.min(1, (centre + margin) / d)) * 100 };
}

/* ─── haversine distance (km) ─── */
function haversineKm(a: HHPoint, b: HHPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function dotIcon(treated: boolean): L.DivIcon {
  const c = treated ? GREEN : RED;
  return L.divIcon({
    className: "hh-dot",
    html: `<span style="display:block;width:15px;height:15px;border-radius:50%;background:${c};border:2px solid #fff;box-shadow:0 0 0 1.5px ${c}66,0 1px 3px rgba(0,0,0,.4)"></span>`,
    iconSize: [15, 15],
    iconAnchor: [7.5, 7.5],
    popupAnchor: [0, -8],
  });
}

interface Props {
  projectId?: string | null;
  formName?: string;
  stateFilter?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  /** "state|lga|ward|community" identities to keep; empty = all. */
  communityFilter?: string[];
  onSelectCommunity?: (community: string, state?: string | null) => void;
}

export default function HouseholdSurveyCoverageMap({
  projectId, formName, stateFilter, dateFrom, dateTo, communityFilter, onSelectCommunity,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<any>(null);
  const lightRef = useRef<L.TileLayer | null>(null);
  const satRef = useRef<L.TileLayer | null>(null);
  const fittedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [basemap, setBasemap] = useState<"light" | "satellite">("light");
  const [show, setShow] = useState<{ treated: boolean; not: boolean }>({ treated: true, not: true });
  const [exporting, setExporting] = useState(false);

  /* ── load survey rows ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        let q = supabase
          .from("household_coverage_surveys" as any)
          .select("id,state,lga,ward,community_name,households,created_at")
          .order("created_at", { ascending: false })
          .limit(3000);
        if (projectId) q = q.eq("project_id", projectId);
        if (stateFilter) q = q.eq("state", stateFilter);
        if (dateFrom) q = q.gte("created_at", dateFrom);
        if (dateTo) q = q.lte("created_at", dateTo);
        const { data, error } = await q;
        if (error) throw error;
        if (!cancelled) setRows((data as any) || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load household survey data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, stateFilter, dateFrom, dateTo, reloadKey]);

  /* ── flatten households → GPS points ── */
  const commSet = useMemo(
    () => (communityFilter && communityFilter.length ? new Set(communityFilter) : null),
    [communityFilter],
  );

  const { points, badGps } = useMemo(() => {
    const pts: HHPoint[] = [];
    let bad = 0;
    for (const s of rows) {
      const state = stripTags(s.state), lga = stripTags(s.lga), ward = stripTags(s.ward), community = stripTags(s.community_name);
      if (commSet) {
        // Must match the dashboard's commIdentity (trim + lowercase).
        const idNorm = (v: string) => v.trim().toLowerCase();
        const id = [idNorm(state), idNorm(lga), idNorm(ward), idNorm(community)].join("|");
        if (!commSet.has(id)) continue;
      }
      (s.households || []).forEach((h, i) => {
        const gps = validGps(h.gps?.lat, h.gps?.lng);
        if (!gps) { bad += 1; return; }
        const offered = personsOffered(h);
        const swallowed = personsSwallowed(h);
        const treated = swallowed > 0 || norm(h.anyone_treated) === "yes";
        pts.push({
          id: `${s.id}:${h.household_no ?? i}`,
          lat: gps.lat, lng: gps.lng,
          accuracy: Number.isFinite(Number(h.gps?.accuracy)) ? Number(h.gps?.accuracy) : null,
          treated, offered, swallowed, coverage: pct(swallowed, offered),
          hh: `HH ${h.household_no ?? i + 1}`,
          community, ward, lga, state,
          at: s.created_at,
        });
      });
    }
    return { points: pts, badGps: bad };
  }, [rows, commSet]);

  const filteredPoints = useMemo(
    () => points.filter((p) => (p.treated ? show.treated : show.not)),
    [points, show],
  );

  /* ── init leaflet map once ── */
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, { center: [9.08, 8.68], zoom: 6, zoomControl: true, preferCanvas: true });
    lightRef.current = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap © CARTO", maxZoom: 19,
    }).addTo(map);
    satRef.current = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "© Esri", maxZoom: 19,
    });
    const cluster = (L as any).markerClusterGroup({ maxClusterRadius: 45, chunkedLoading: true });
    clusterRef.current = cluster;
    map.addLayer(cluster);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* ── basemap switch ── */
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (basemap === "satellite") {
      lightRef.current && map.removeLayer(lightRef.current);
      satRef.current && !map.hasLayer(satRef.current) && satRef.current.addTo(map);
    } else {
      satRef.current && map.removeLayer(satRef.current);
      lightRef.current && !map.hasLayer(lightRef.current) && lightRef.current.addTo(map);
    }
  }, [basemap]);

  /* ── redraw markers ── */
  useEffect(() => {
    const cluster = clusterRef.current, map = mapRef.current;
    if (!cluster || !map) return;
    cluster.clearLayers();
    const markers: L.Marker[] = [];
    for (const p of filteredPoints) {
      const m = L.marker([p.lat, p.lng], { icon: dotIcon(p.treated) });
      m.bindTooltip(`${p.hh} · ${p.treated ? "Treated" : "Not treated"}${p.community ? ` — ${p.community}` : ""}`, { direction: "top", offset: [0, -8] });
      m.bindPopup(
        `<div style="font-size:12px;min-width:170px">
          <div style="font-weight:700;margin-bottom:2px">${p.hh}</div>
          <div style="color:${p.treated ? GREEN : RED};font-weight:600;margin-bottom:4px">${p.treated ? "✓ Therapeutic coverage" : "✕ No therapeutic coverage"}</div>
          <div>${p.community || "—"}</div>
          <div style="color:#64748b">${[p.ward, p.lga, p.state].filter(Boolean).join(" · ")}</div>
          <div style="margin-top:4px">Swallowed <b>${p.swallowed}</b> of <b>${p.offered}</b> offered${p.offered ? ` (${p.coverage.toFixed(0)}%)` : ""}</div>
          ${p.accuracy != null ? `<div style="color:#64748b">GPS ±${p.accuracy.toFixed(0)} m</div>` : ""}
        </div>`,
      );
      if (onSelectCommunity && p.community) m.on("popupopen", () => onSelectCommunity(p.community, p.state));
      markers.push(m);
    }
    cluster.addLayers(markers);
    if (!fittedRef.current && filteredPoints.length) {
      const b = L.latLngBounds(filteredPoints.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(b.pad(0.2), { maxZoom: 15 });
      fittedRef.current = true;
    }
  }, [filteredPoints, onSelectCommunity]);

  // Re-fit when the dataset identity changes (new filters).
  useEffect(() => { fittedRef.current = false; }, [projectId, stateFilter, dateFrom, dateTo, commSet]);

  /* ── geospatial analytics ── */
  const analytics = useMemo(() => {
    const total = points.length;
    const treated = points.filter((p) => p.treated).length;
    const notTreated = total - treated;
    const ci = wilson(treated, total);

    // person-level therapeutic coverage
    const offered = points.reduce((a, p) => a + p.offered, 0);
    const swallowed = points.reduce((a, p) => a + p.swallowed, 0);
    const txCi = wilson(swallowed, offered);

    // geography rollup (community)
    const geo = new Map<string, { label: string; sub: string; total: number; treated: number }>();
    for (const p of points) {
      const key = `${norm(p.state)}|${norm(p.lga)}|${norm(p.community)}`;
      let g = geo.get(key);
      if (!g) { g = { label: p.community || "Unspecified", sub: [p.ward, p.lga, p.state].filter(Boolean).join(" · "), total: 0, treated: 0 }; geo.set(key, g); }
      g.total += 1; if (p.treated) g.treated += 1;
    }
    const geoRows = [...geo.values()].map((g) => ({ ...g, cov: pct(g.treated, g.total) })).sort((a, b) => a.cov - b.cov);

    // spatial spread
    let extentKm2 = 0, meanNn = 0, centroid: { lat: number; lng: number } | null = null;
    if (total > 0) {
      const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
      const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLn = Math.min(...lngs), maxLn = Math.max(...lngs);
      const hKm = (maxLa - minLa) * 111;
      const wKm = (maxLn - minLn) * 111 * Math.cos((((minLa + maxLa) / 2) * Math.PI) / 180);
      extentKm2 = Math.max(0, hKm * wKm);
      centroid = { lat: lats.reduce((a, b) => a + b, 0) / total, lng: lngs.reduce((a, b) => a + b, 0) / total };
      // mean nearest-neighbour distance (sampled for large sets)
      const sample = total > 400 ? points.filter((_, i) => i % Math.ceil(total / 400) === 0) : points;
      let sum = 0, n = 0;
      for (const a of sample) {
        let best = Infinity;
        for (const b of points) { if (a === b) continue; const d = haversineKm(a, b); if (d < best) best = d; }
        if (Number.isFinite(best)) { sum += best; n += 1; }
      }
      meanNn = n ? sum / n : 0;
    }

    // cold-spot detection: communities where <50% treated AND ≥3 households
    const coldSpots = geoRows.filter((g) => g.total >= 3 && g.cov < 50);

    return {
      total, treated, notTreated, ci, offered, swallowed, txCi,
      geoRows, extentKm2, meanNn, centroid, coldSpots,
      communities: geo.size, badGps,
    };
  }, [points, badGps]);

  const a = analytics;

  /* ── CSV export of the full geospatial analysis ── */
  const exportCsv = () => {
    try {
      const hh = a.ci, tx = a.txCi;
      const lines: (string | number)[][] = [];
      const push = (...cells: (string | number)[]) => lines.push(cells);

      push("Section", "Metric", "Value", "Detail");
      push("Summary", "Households mapped", a.total, `${a.communities} communities`);
      push("Summary", "Households treated", a.treated, `${hh.p.toFixed(1)}% (95% CI ${hh.lo.toFixed(1)}–${hh.hi.toFixed(1)}%)`);
      push("Summary", "Households not treated", a.notTreated, "");
      push("Summary", "Therapeutic coverage", `${tx.p.toFixed(1)}%`, `95% CI ${tx.lo.toFixed(1)}–${tx.hi.toFixed(1)}% · ${a.swallowed}/${a.offered} swallowed`);
      push("Spatial", "Extent (km²)", a.extentKm2.toFixed(2), "");
      push("Spatial", "Mean nearest-neighbour distance", a.meanNn < 1 ? `${(a.meanNn * 1000).toFixed(0)} m` : `${a.meanNn.toFixed(2)} km`, "");
      if (a.centroid) push("Spatial", "Centroid", `${a.centroid.lat.toFixed(5)}, ${a.centroid.lng.toFixed(5)}`, "");
      push("Spatial", "Households without valid GPS", a.badGps, "");
      lines.push([]);

      push("Cold-spots (mop-up targets)", "Community", "Coverage %", "Treated / Total");
      if (a.coldSpots.length === 0) push("Cold-spots (mop-up targets)", "None below 50%", "", "");
      for (const g of a.coldSpots) push("Cold-spot", `${g.label} · ${g.sub}`, g.cov.toFixed(0), `${g.treated}/${g.total}`);
      lines.push([]);

      push("Coverage by community (lowest first)", "Community", "Coverage %", "Treated / Total");
      for (const g of a.geoRows) push("Community", `${g.label} · ${g.sub}`, g.cov.toFixed(0), `${g.treated}/${g.total}`);

      downloadCsv(
        `household-coverage-analysis-${new Date().toISOString().slice(0, 10)}`,
        toCsv(lines[0].map(String), lines.slice(1)),
      );
      toast.success("Analysis exported as CSV");
    } catch (e: any) {
      toast.error("Failed to export CSV");
    }
  };

  /* ── PDF export of the map + full analysis ── */
  const exportPdf = async () => {
    if (!rootRef.current) return;
    setExporting(true);
    toast.info("Preparing PDF…");
    try {
      await exportDashboardPdf(rootRef.current, {
        title: "Household Coverage Survey — Geospatial Analysis",
        subtitle: `${a.total} households · ${a.communities} communities`,
        fileName: "household-coverage-analysis",
      });
      toast.success("Analysis exported as PDF");
    } catch (e: any) {
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  const legendFiltered = !show.treated || !show.not;

  return (
    <div ref={rootRef} className="space-y-3">
      {/* header */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-r from-emerald-500/10 to-rose-500/10 p-3 sm:p-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${GREEN}1a`, color: GREEN }}>
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Household Coverage Survey Map</h3>
            <p className="text-[11px] text-muted-foreground">
              Every surveyed household plotted at its unique GPS — green where therapeutic coverage was achieved, red where it was not.
            </p>
          </div>
          <div className="ml-auto flex w-full flex-wrap items-center gap-1.5 sm:w-auto" data-pdf-exclude="true">
            <Button variant={basemap === "light" ? "secondary" : "outline"} size="sm" className="h-8 flex-1 px-2 text-xs sm:flex-none" onClick={() => setBasemap("light")}>
              <Layers className="mr-1 h-3.5 w-3.5" /> Map
            </Button>
            <Button variant={basemap === "satellite" ? "secondary" : "outline"} size="sm" className="h-8 flex-1 px-2 text-xs sm:flex-none" onClick={() => setBasemap("satellite")}>
              <Satellite className="mr-1 h-3.5 w-3.5" /> Satellite
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 flex-1 px-2 text-xs sm:flex-none" disabled={exporting || a.total === 0}>
                  {exporting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportPdf}>
                  <FileText className="mr-2 h-4 w-4" /> PDF (map + analysis)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportCsv}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> CSV (analysis data)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* legend / filter */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs sm:px-4">
          <button
            type="button" onClick={() => setShow((s) => ({ ...s, treated: !s.treated }))}
            aria-pressed={show.treated}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${show.treated ? "border-transparent" : "opacity-40"}`}
            style={{ background: `${GREEN}14` }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: GREEN }} />
            Treated <span className="font-semibold tabular-nums">{a.treated}</span>
          </button>
          <button
            type="button" onClick={() => setShow((s) => ({ ...s, not: !s.not }))}
            aria-pressed={show.not}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${show.not ? "border-transparent" : "opacity-40"}`}
            style={{ background: `${RED}14` }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: RED }} />
            Not treated <span className="font-semibold tabular-nums">{a.notTreated}</span>
          </button>
          {legendFiltered && (
            <button
              type="button" onClick={() => setShow({ treated: true, not: true })}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-muted-foreground transition hover:text-foreground"
              data-pdf-exclude="true"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
          <Badge variant="secondary" className="ml-auto text-[10px]">{a.total} households · {a.communities} communities</Badge>
        </div>

        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-background/70">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {error ? (
            <div className="p-8 text-center">
              <AlertTriangle className="mx-auto mb-2 h-7 w-7 text-amber-500" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : !loading && a.total === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Home className="mx-auto mb-2 h-7 w-7 opacity-40" />
              No geolocated households in the Repeat Household Coverage Survey for this scope yet.
            </div>
          ) : (
            <div ref={containerRef} className="h-[460px] w-full" style={{ background: "#eef2f6" }} />
          )}
        </div>
      </Card>

      {/* ── Geospatial analysis ── */}
      {a.total > 0 && (
        <GeoAnalysis a={a} />
      )}
    </div>
  );
}

/* ─────────────────────── analysis panel ─────────────────────── */
function GeoAnalysis({ a }: { a: any }) {
  const hhCov = a.ci as { p: number; lo: number; hi: number };
  const txCov = a.txCi as { p: number; lo: number; hi: number };
  const verdict = (p: number) => (p >= 80 ? { t: "Strong", c: GREEN, I: TrendingUp } : p >= 50 ? { t: "Moderate", c: AMBER, I: Target } : { t: "Weak", c: RED, I: TrendingDown });
  const hhV = verdict(hhCov.p), txV = verdict(txCov.p);

  // spatial dispersion interpretation
  const dispersion = a.meanNn < 0.15
    ? "tightly clustered — households sit very close together, typical of compact settlements."
    : a.meanNn < 0.6
      ? "moderately spread across the community footprint."
      : "widely dispersed — households are far apart, suggesting scattered rural coverage.";

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${SLATE}1a`, color: SLATE }}>
          <Sigma className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Geospatial Coverage Analysis</h3>
          <p className="text-[11px] text-muted-foreground">Where treatment reached households, how it is distributed in space, and where the gaps cluster.</p>
        </div>
      </div>
      <CardContent className="space-y-4 p-4">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-border p-3" style={{ background: `linear-gradient(135deg, ${txV.c}12, transparent 70%)` }}>
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><ShieldCheck className="h-3 w-3" />Therapeutic coverage</p>
            <p className="font-display text-2xl font-bold" style={{ color: txV.c }}>{txCov.p.toFixed(1)}%</p>
            <p className="text-[11px] text-muted-foreground">95% CI {txCov.lo.toFixed(1)}–{txCov.hi.toFixed(1)}% · {a.swallowed}/{a.offered} swallowed</p>
          </div>
          <div className="rounded-xl border border-border p-3" style={{ background: `linear-gradient(135deg, ${hhV.c}12, transparent 70%)` }}>
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><Home className="h-3 w-3" />Households treated</p>
            <p className="font-display text-2xl font-bold" style={{ color: hhV.c }}>{hhCov.p.toFixed(1)}%</p>
            <p className="text-[11px] text-muted-foreground">95% CI {hhCov.lo.toFixed(1)}–{hhCov.hi.toFixed(1)}% · {a.treated}/{a.total} homes</p>
          </div>
          <div className="rounded-xl border border-border p-3" style={{ background: `linear-gradient(135deg, ${SLATE}12, transparent 70%)` }}>
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><Crosshair className="h-3 w-3" />Spatial extent</p>
            <p className="font-display text-2xl font-bold" style={{ color: SLATE }}>{a.extentKm2 >= 1 ? `${a.extentKm2.toFixed(0)}` : a.extentKm2.toFixed(1)}<span className="text-sm"> km²</span></p>
            <p className="text-[11px] text-muted-foreground">avg. neighbour {a.meanNn < 1 ? `${(a.meanNn * 1000).toFixed(0)} m` : `${a.meanNn.toFixed(1)} km`}</p>
          </div>
          <div className="rounded-xl border border-border p-3" style={{ background: `linear-gradient(135deg, ${RED}12, transparent 70%)` }}>
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><Radar className="h-3 w-3" />Cold-spots</p>
            <p className="font-display text-2xl font-bold" style={{ color: a.coldSpots.length ? RED : GREEN }}>{a.coldSpots.length}</p>
            <p className="text-[11px] text-muted-foreground">communities under 50% reach</p>
          </div>
        </div>

        {/* interpretation */}
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-[12px] leading-relaxed text-foreground">
          <p className="mb-1 font-semibold">Interpretation</p>
          <p>
            Across <b>{a.total}</b> geolocated households in <b>{a.communities}</b> communities, therapeutic coverage stands at{" "}
            <b style={{ color: txV.c }}>{txCov.p.toFixed(1)}%</b> (95% CI {txCov.lo.toFixed(1)}–{txCov.hi.toFixed(1)}%),
            meaning we are 95% confident the true swallowing rate lies in that band. Coverage is <b>{txV.t.toLowerCase()}</b> against the 80% MDA target.{" "}
            {hhCov.p >= 80
              ? `Green points dominate the map — treatment reached the great majority of homes.`
              : hhCov.p >= 50
                ? `The mix of green and red points shows treatment reached most, but not all, homes.`
                : `Red points are widespread — a large share of households were missed.`}{" "}
            Households are {dispersion}
            {a.coldSpots.length > 0
              ? ` Attention is needed in ${a.coldSpots.length} cold-spot ${a.coldSpots.length === 1 ? "community" : "communities"} where fewer than half of households were treated (listed below) — these clustered red zones are the priority for mop-up.`
              : ` No community fell below 50% coverage, so there are no red cold-spot clusters to prioritise.`}
          </p>
        </div>

        {/* cold spots */}
        {a.coldSpots.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground"><Radar className="h-3.5 w-3.5" style={{ color: RED }} />Priority cold-spots (mop-up targets)</p>
            <div className="space-y-1.5">
              {a.coldSpots.slice(0, 8).map((g: any) => (
                <div key={g.label + g.sub} className="flex items-center gap-2 rounded-lg border border-rose-200/60 bg-rose-50/60 p-2 dark:border-rose-500/20 dark:bg-rose-950/20">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RED }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{g.label}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{g.sub}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: RED }}>{g.cov.toFixed(0)}%</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{g.treated}/{g.total}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* coverage by community */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-foreground">Household coverage by community (lowest first)</p>
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {a.geoRows.map((g: any) => (
              <div key={g.label + g.sub}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="truncate text-foreground">{g.label} <span className="text-muted-foreground">· {g.sub}</span></span>
                  <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">{g.treated}/{g.total} · {g.cov.toFixed(0)}%</span>
                </div>
                <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${g.cov}%`, background: g.cov >= 80 ? GREEN : g.cov >= 50 ? AMBER : RED }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {a.badGps > 0 && (
          <p className="text-[10px] text-muted-foreground">{a.badGps} household{a.badGps === 1 ? "" : "s"} had no valid GPS and could not be mapped.</p>
        )}
      </CardContent>
    </Card>
  );
}
