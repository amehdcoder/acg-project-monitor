/// <reference types="google.maps" />
/**
 * GPS Truth Map — Google satellite / Street View verification of every
 * community visit captured on KoboToolbox.
 *
 * For each parent (community) submission we take the device GPS fix, plot it
 * on high-resolution Google satellite imagery, reverse-geocode it, and compare
 * the place name the basemap reports with the community name the monitor typed
 * in Kobo. Supervisors can drop into Street View at the exact coordinate to
 * visually confirm the settlement.
 *
 * If the Google Maps key is unavailable/rejected the map falls back to Esri
 * World Imagery (Leaflet) so the panel never dies.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Satellite, Eye, RefreshCw, Search, MapPin, ShieldCheck, ShieldAlert, Loader2,
} from "lucide-react";
import GoogleStreetViewPanel from "@/components/maps/GoogleStreetViewPanel";
import { loadGoogleMaps, googleMapsAuthFailed } from "@/lib/maps/googleMapsLoader";
import {
  reverseGeocodeBatch, verifyPlace, geoKey, STATUS_META,
  type GeoName, type VerifyResult, type VerifyStatus,
} from "@/lib/isc/gpsVerification";

type Row = Record<string, unknown>;

const s = (v: unknown) => String(v ?? "").trim();

function parsePoint(v: unknown): { lat: number; lng: number } | null {
  if (!v) return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const lat = Number(o.lat ?? o.latitude);
    const lng = Number((o as any).long ?? (o as any).lon ?? o.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }
  const p = s(v).split(/[\s,]+/).map(Number);
  if (p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  if (p[0] === 0 && p[1] === 0) return null;
  return { lat: p[0], lng: p[1] };
}

interface VisitPoint {
  id: string;
  lat: number;
  lng: number;
  community: string;
  ward: string;
  lga: string;
  state: string;
  monitor: string;
  date: string;
  verify?: VerifyResult;
}

export default function GpsCommunityVerification({ parents }: { parents: Row[] }) {
  const mapDiv = useRef<HTMLDivElement>(null);
  const gmapRef = useRef<google.maps.Map | null>(null);
  const gMarkers = useRef<google.maps.Marker[]>([]);
  const lmapRef = useRef<L.Map | null>(null);
  const lLayer = useRef<L.LayerGroup | null>(null);

  const [provider, setProvider] = useState<"loading" | "google" | "esri">("loading");
  const [geoMap, setGeoMap] = useState<Map<string, GeoName | null>>(new Map());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<VerifyStatus | "all">("all");
  const [sv, setSv] = useState<{ lat: number; lng: number; title: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  /* ------------------------------------------------------------- raw points */
  const points = useMemo<VisitPoint[]>(() => {
    const out: VisitPoint[] = [];
    const seen = new Set<string>();
    parents.forEach((p, i) => {
      const g = parsePoint(p.GPS ?? p._geolocation);
      if (!g) return;
      const community = s(p.COMMUNITIES) || "Unnamed community";
      const key = `${community.toLowerCase()}|${g.lat.toFixed(4)}|${g.lng.toFixed(4)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        id: s(p._id) || `${i}`,
        lat: g.lat, lng: g.lng,
        community,
        ward: s(p.Ward), lga: s(p.LGA), state: s(p.State),
        monitor: s(p.Independent_Monitor_s_Name) || s(p.Designation),
        date: s(p._submission_time).slice(0, 10),
      });
    });
    return out;
  }, [parents]);

  /* -------------------------------------------------------- verification run */
  const runVerification = async (force = false) => {
    if (running || points.length === 0) return;
    setRunning(true);
    setProgress({ done: 0, total: points.length });
    const res = await reverseGeocodeBatch(
      points.map((p) => ({ lat: p.lat, lng: p.lng })),
      (done, total) => setProgress({ done, total }),
    );
    setGeoMap(new Map(res));
    setRunning(false);
  };

  useEffect(() => {
    if (points.length && geoMap.size === 0 && !running) void runVerification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);

  const verified = useMemo<VisitPoint[]>(
    () => points.map((p) => ({
      ...p,
      verify: verifyPlace(
        { community: p.community, ward: p.ward, lga: p.lga, state: p.state },
        geoMap.get(geoKey(p.lat, p.lng)) ?? null,
      ),
    })),
    [points, geoMap],
  );

  const counts = useMemo(() => {
    const c: Record<VerifyStatus, number> = { verified: 0, nearby: 0, mismatch: 0, outside: 0, unknown: 0 };
    verified.forEach((p) => { if (p.verify) c[p.verify.status]++; });
    return c;
  }, [verified]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return verified.filter((p) => {
      if (statusFilter !== "all" && p.verify?.status !== statusFilter) return false;
      if (!q) return true;
      return [p.community, p.ward, p.lga, p.state, p.verify?.matchedName, p.verify?.displayName]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [verified, query, statusFilter]);

  const confirmRate = points.length
    ? Math.round(((counts.verified + counts.nearby) / points.length) * 100)
    : 0;

  /* ------------------------------------------------------------------- maps */
  useEffect(() => {
    let cancelled = false;
    const el = mapDiv.current;
    if (!el) return;
    (async () => {
      try {
        if (googleMapsAuthFailed) throw new Error("auth");
        await loadGoogleMaps();
        if (cancelled || googleMapsAuthFailed) throw new Error("auth");
        const map = new google.maps.Map(el, {
          center: { lat: 9.082, lng: 8.6753 },
          zoom: 6,
          mapTypeId: google.maps.MapTypeId.HYBRID,
          tilt: 0,
          streetViewControl: true,
          fullscreenControl: true,
          mapTypeControl: true,
          maxZoom: 22,
        });
        gmapRef.current = map;
        setProvider("google");
      } catch {
        if (cancelled) return;
        const map = L.map(el, { zoomControl: true, attributionControl: false }).setView([9.082, 8.6753], 6);
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 23, maxNativeZoom: 19, detectRetina: true },
        ).addTo(map);
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 23, maxNativeZoom: 19, opacity: 0.9 },
        ).addTo(map);
        lmapRef.current = map;
        lLayer.current = L.layerGroup().addTo(map);
        setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 60);
        setProvider("esri");
      }
    })();
    return () => {
      cancelled = true;
      gMarkers.current.forEach((m) => m.setMap(null));
      gMarkers.current = [];
      if (lmapRef.current) { lmapRef.current.remove(); lmapRef.current = null; }
      gmapRef.current = null;
    };
  }, []);

  // Draw / redraw markers whenever the verification state or filter changes.
  useEffect(() => {
    const list = shown;
    if (provider === "google" && gmapRef.current) {
      const map = gmapRef.current;
      gMarkers.current.forEach((m) => m.setMap(null));
      gMarkers.current = [];
      const bounds = new google.maps.LatLngBounds();
      const info = new google.maps.InfoWindow();
      list.forEach((p) => {
        const meta = STATUS_META[p.verify?.status ?? "unknown"];
        const marker = new google.maps.Marker({
          position: { lat: p.lat, lng: p.lng },
          map,
          title: `${p.community} — ${meta.label}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: meta.color,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => {
          setActiveId(p.id);
          info.setContent(
            `<div style="font:12px/1.5 system-ui;min-width:210px">
              <strong style="font-size:13px">${escapeHtml(p.community)}</strong><br/>
              <span style="color:${meta.color};font-weight:700">${meta.label} · ${p.verify?.score ?? 0}%</span><br/>
              Basemap: ${escapeHtml(p.verify?.matchedName || "—")}<br/>
              ${escapeHtml(p.ward)} ward · ${escapeHtml(p.lga)} · ${escapeHtml(p.state)}<br/>
              <span style="color:#64748b">${escapeHtml(p.verify?.displayName || "")}</span><br/>
              <span style="color:#64748b">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>
            </div>`,
          );
          info.open({ map, anchor: marker });
        });
        gMarkers.current.push(marker);
        bounds.extend({ lat: p.lat, lng: p.lng });
      });
      if (list.length) map.fitBounds(bounds, 48);
    } else if (provider === "esri" && lmapRef.current && lLayer.current) {
      const map = lmapRef.current;
      lLayer.current.clearLayers();
      const b = L.latLngBounds([]);
      list.forEach((p) => {
        const meta = STATUS_META[p.verify?.status ?? "unknown"];
        L.circleMarker([p.lat, p.lng], {
          radius: 7, color: "#fff", weight: 2, fillColor: meta.color, fillOpacity: 1,
        })
          .bindPopup(
            `<div style="font:12px/1.5 system-ui;min-width:200px"><strong>${escapeHtml(p.community)}</strong><br/>
             <span style="color:${meta.color};font-weight:700">${meta.label} · ${p.verify?.score ?? 0}%</span><br/>
             Basemap: ${escapeHtml(p.verify?.matchedName || "—")}</div>`,
          )
          .on("click", () => setActiveId(p.id))
          .addTo(lLayer.current!);
        b.extend([p.lat, p.lng]);
      });
      if (b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
    }
  }, [shown, provider]);

  const focus = (p: VisitPoint) => {
    setActiveId(p.id);
    if (provider === "google" && gmapRef.current) {
      gmapRef.current.setCenter({ lat: p.lat, lng: p.lng });
      gmapRef.current.setZoom(19);
      gmapRef.current.setMapTypeId(google.maps.MapTypeId.HYBRID);
    } else if (lmapRef.current) {
      lmapRef.current.setView([p.lat, p.lng], 19);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Satellite className="h-4 w-4 text-primary" />
              GPS Truth Map — community name verification
            </CardTitle>
            <CardDescription>
              Each visit’s GPS fix is plotted on high-resolution satellite imagery, reverse-geocoded, and
              matched against the community name captured on KoboToolbox. Drop into Street View to confirm
              the settlement visually.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => runVerification(true)} disabled={running || !points.length}>
            {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Re-verify
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="GPS points" value={points.length} icon={MapPin} color="#0f172a" />
          <Kpi label="Confirmed rate" value={`${confirmRate}%`} icon={ShieldCheck} color="#16a34a" />
          {(["verified", "nearby", "mismatch", "outside"] as VerifyStatus[]).map((k) => (
            <button
              key={k}
              onClick={() => setStatusFilter(statusFilter === k ? "all" : k)}
              className={`rounded-lg border p-2.5 text-left transition ${statusFilter === k ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {STATUS_META[k].label}
              </div>
              <div className="text-lg font-bold" style={{ color: STATUS_META[k].color }}>{counts[k]}</div>
            </button>
          ))}
        </div>

        {running && (
          <div className="space-y-1">
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">
              Geolocating {progress.done} / {progress.total} GPS points…
            </p>
          </div>
        )}

        {/* Map */}
        <div className="relative overflow-hidden rounded-xl border border-border">
          <div ref={mapDiv} style={{ height: 480, width: "100%" }} />
          {provider === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {points.length === 0 && provider !== "loading" && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-background/75 text-sm text-muted-foreground">
              No GPS coordinates in the current filter.
            </div>
          )}
          <div className="absolute left-3 top-3 z-[500] flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_META) as VerifyStatus[]).map((k) => (
              <span
                key={k}
                title={STATUS_META[k].hint}
                className="flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold shadow"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[k].color }} />
                {STATUS_META[k].label}
              </span>
            ))}
          </div>
          {provider === "esri" && (
            <Badge variant="secondary" className="absolute right-3 top-3 z-[500] text-[10px]">
              Esri imagery (Google key unavailable)
            </Badge>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search community, ward, LGA or basemap place name…"
            className="h-9 pl-8 text-sm"
          />
        </div>

        {/* Verification register */}
        <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="text-left">
                {["Community (Kobo)", "Basemap place name", "Verdict", "Match", "Ward / LGA / State", "Coordinates", ""].map((h) => (
                  <th key={h} className="whitespace-nowrap px-2.5 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No matching GPS records.</td></tr>
              )}
              {shown.map((p) => {
                const meta = STATUS_META[p.verify?.status ?? "unknown"];
                return (
                  <tr
                    key={p.id + p.lat}
                    onClick={() => focus(p)}
                    className={`cursor-pointer border-t border-border/60 transition hover:bg-muted/40 ${activeId === p.id ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-2.5 py-2 font-semibold">{p.community}</td>
                    <td className="px-2.5 py-2">
                      <div className="font-medium">{p.verify?.matchedName || "—"}</div>
                      <div className="max-w-[280px] truncate text-[10px] text-muted-foreground" title={p.verify?.displayName}>
                        {p.verify?.displayName || ""}
                      </div>
                    </td>
                    <td className="px-2.5 py-2">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ background: meta.color }}
                      >
                        {p.verify?.status === "verified" ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                        {meta.label}
                      </span>
                      <div className="mt-0.5 max-w-[260px] text-[10px] text-muted-foreground">{p.verify?.reason}</div>
                    </td>
                    <td className="px-2.5 py-2 font-mono font-bold" style={{ color: meta.color }}>{p.verify?.score ?? 0}%</td>
                    <td className="px-2.5 py-2 text-muted-foreground">{[p.ward, p.lga, p.state].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-2.5 py-2 font-mono text-[10px] text-muted-foreground">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</td>
                    <td className="px-2.5 py-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-[10px]"
                        onClick={(e) => { e.stopPropagation(); setSv({ lat: p.lat, lng: p.lng, title: `${p.community} — Street View` }); }}
                      >
                        <Eye className="mr-1 h-3 w-3" /> Street View
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>

      <GoogleStreetViewPanel
        open={!!sv}
        onOpenChange={(o) => !o && setSv(null)}
        lat={sv?.lat ?? null}
        lng={sv?.lng ?? null}
        title={sv?.title ?? "Street View"}
      />
    </Card>
  );
}

function Kpi({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function escapeHtml(v: string | undefined): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
