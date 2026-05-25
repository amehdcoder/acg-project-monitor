import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, GeoJSON } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, FileCheck, ClipboardList, Compass } from "lucide-react";

// State centroids (mirrors src/hooks/useDataAnalytics)
const NIGERIAN_STATES: { name: string; lat: number; lng: number }[] = [
  { name: "Abia", lat: 5.4527, lng: 7.5248 },
  { name: "Adamawa", lat: 9.3265, lng: 12.3984 },
  { name: "Akwa Ibom", lat: 5.051, lng: 7.9335 },
  { name: "Anambra", lat: 6.2209, lng: 6.937 },
  { name: "Bauchi", lat: 10.3158, lng: 9.8442 },
  { name: "Bayelsa", lat: 4.7719, lng: 6.0699 },
  { name: "Benue", lat: 7.3369, lng: 8.7404 },
  { name: "Borno", lat: 11.8333, lng: 13.15 },
  { name: "Cross River", lat: 5.8702, lng: 8.5988 },
  { name: "Delta", lat: 5.5324, lng: 5.7662 },
  { name: "Ebonyi", lat: 6.2649, lng: 8.0137 },
  { name: "Edo", lat: 6.335, lng: 5.6037 },
  { name: "Ekiti", lat: 7.719, lng: 5.311 },
  { name: "Enugu", lat: 6.4584, lng: 7.5464 },
  { name: "FCT Abuja", lat: 9.0765, lng: 7.3986 },
  { name: "Gombe", lat: 10.2897, lng: 11.1673 },
  { name: "Imo", lat: 5.4921, lng: 7.026 },
  { name: "Jigawa", lat: 12.228, lng: 9.5616 },
  { name: "Kaduna", lat: 10.5222, lng: 7.4383 },
  { name: "Kano", lat: 12.0022, lng: 8.592 },
  { name: "Katsina", lat: 13.0059, lng: 7.6 },
  { name: "Kebbi", lat: 12.4539, lng: 4.1975 },
  { name: "Kogi", lat: 7.7337, lng: 6.6906 },
  { name: "Kwara", lat: 8.4799, lng: 4.5418 },
  { name: "Lagos", lat: 6.5244, lng: 3.3792 },
  { name: "Nasarawa", lat: 8.538, lng: 8.322 },
  { name: "Niger", lat: 9.9309, lng: 5.5983 },
  { name: "Ogun", lat: 6.998, lng: 3.4737 },
  { name: "Ondo", lat: 7.25, lng: 5.1931 },
  { name: "Osun", lat: 7.5629, lng: 4.52 },
  { name: "Oyo", lat: 7.85, lng: 3.9333 },
  { name: "Plateau", lat: 9.2182, lng: 9.5175 },
  { name: "Rivers", lat: 4.8581, lng: 6.9209 },
  { name: "Sokoto", lat: 13.0533, lng: 5.2476 },
  { name: "Taraba", lat: 7.9994, lng: 10.774 },
  { name: "Yobe", lat: 12.2939, lng: 11.439 },
  { name: "Zamfara", lat: 12.1704, lng: 6.2534 },
];

type Status = "visited" | "priority" | "ongoing" | "not_visited";

const STATUS_STYLE: Record<Status, { color: string; label: string }> = {
  visited: { color: "#0d9488", label: "Visited State" },
  priority: { color: "#f59e0b", label: "Priority Follow-up" },
  ongoing: { color: "#60a5fa", label: "Ongoing Review" },
  not_visited: { color: "#94a3b8", label: "Not Visited" },
};

export interface MdaSubmissionLite {
  id: string;
  state?: string | null;
  lga?: string | null;
  submitter?: string | null;
  submittedAt?: string | null;
  location?: { latitude?: number; longitude?: number } | null;
  status?: string | null; // submission status: finalized / draft / sent
}

interface Props {
  submissions: MdaSubmissionLite[];
  formName?: string;
  monitoringPeriod?: string;
}

// Normalize a state value coming from submissions to our canonical list.
function normalizeState(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    fct: "FCT Abuja",
    "fct abuja": "FCT Abuja",
    abuja: "FCT Abuja",
    "federal capital territory": "FCT Abuja",
    nassarawa: "Nasarawa",
  };
  if (map[v]) return map[v];
  const match = NIGERIAN_STATES.find((s) => s.name.toLowerCase() === v);
  return match ? match.name : null;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function inferStateFromGPS(lat: number, lng: number): string | null {
  let best: { name: string; d: number } | null = null;
  for (const s of NIGERIAN_STATES) {
    const d = haversineKm({ lat, lng }, s);
    if (!best || d < best.d) best = { name: s.name, d };
  }
  // Anything farther than 350 km from the nearest state centroid is probably outside Nigeria.
  return best && best.d < 350 ? best.name : null;
}

interface StateRollup {
  state: string;
  visits: number;
  lgas: Set<string>;
  supervisors: Set<string>;
  finalized: number;
  total: number;
  lastVisit?: string;
}

export default function MdaSupervisoryMap({ submissions, formName, monitoringPeriod }: Props) {
  const [geoData, setGeoData] = useState<any | null>(null);

  // Attempt to load a Nigeria states GeoJSON for true choropleth shading; gracefully
  // fall back to colored centroid circles when unavailable (offline / blocked CDN).
  useEffect(() => {
    let cancelled = false;
    const sources = [
      "https://cdn.jsdelivr.net/gh/codeforafrica-svc/Nigeria-states-geojson@main/nigeria-states.geojson",
      "https://cdn.jsdelivr.net/gh/africaopendata/africa-geojson@master/countries/nigeria/nigeria-states.geojson",
    ];
    (async () => {
      for (const url of sources) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const j = await r.json();
          if (!cancelled && j?.features?.length) {
            setGeoData(j);
            return;
          }
        } catch {
          /* try next */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rollupByState = useMemo(() => {
    const map = new Map<string, StateRollup>();
    for (const s of submissions) {
      let state = normalizeState(s.state);
      if (!state && s.location?.latitude && s.location?.longitude) {
        state = inferStateFromGPS(s.location.latitude, s.location.longitude);
      }
      if (!state) continue;
      const r =
        map.get(state) ??
        ({
          state,
          visits: 0,
          lgas: new Set<string>(),
          supervisors: new Set<string>(),
          finalized: 0,
          total: 0,
        } as StateRollup);
      r.visits += 1;
      r.total += 1;
      if (s.lga) r.lgas.add(s.lga.trim());
      if (s.submitter) r.supervisors.add(s.submitter.trim());
      if (s.status === "finalized" || s.status === "sent") r.finalized += 1;
      if (s.submittedAt && (!r.lastVisit || s.submittedAt > r.lastVisit)) r.lastVisit = s.submittedAt;
      map.set(state, r);
    }
    return map;
  }, [submissions]);

  const statusForState = (state: string): Status => {
    const r = rollupByState.get(state);
    if (!r) return "not_visited";
    const reportingRate = r.total === 0 ? 0 : r.finalized / r.total;
    if (r.visits >= 5 && reportingRate >= 0.8) return "visited";
    if (reportingRate < 0.5 && r.visits >= 1) return "priority";
    if (r.visits >= 1) return "ongoing";
    return "not_visited";
  };

  const kpis = useMemo(() => {
    const visitedStates = Array.from(rollupByState.values()).filter((r) => r.visits >= 1);
    const lgas = new Set<string>();
    const supervisors = new Set<string>();
    let finalized = 0;
    let total = 0;
    for (const r of rollupByState.values()) {
      r.lgas.forEach((l) => lgas.add(`${r.state}|${l}`));
      r.supervisors.forEach((s) => supervisors.add(s));
      finalized += r.finalized;
      total += r.total;
    }
    return {
      statesVisited: visitedStates.length,
      totalStates: NIGERIAN_STATES.length,
      lgasCovered: lgas.size,
      supervisorsDeployed: supervisors.size,
      reportingRate: total === 0 ? 0 : Math.round((finalized / total) * 100),
    };
  }, [rollupByState]);

  const geoStyle = (feature: any) => {
    const props = feature?.properties || {};
    const candidate =
      props.admin1Name || props.NAME_1 || props.name || props.STATE || props.state || "";
    const norm = normalizeState(candidate);
    const status = norm ? statusForState(norm) : "not_visited";
    return {
      color: "#475569",
      weight: 0.8,
      fillColor: STATUS_STYLE[status].color,
      fillOpacity: 0.55,
    };
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const props = feature?.properties || {};
    const candidate =
      props.admin1Name || props.NAME_1 || props.name || props.STATE || props.state || "Unknown";
    const norm = normalizeState(candidate) || candidate;
    const r = rollupByState.get(norm);
    const status = norm ? statusForState(norm) : "not_visited";
    layer.bindTooltip(
      `<strong>${norm}</strong><br/>${STATUS_STYLE[status].label}` +
        (r ? `<br/>Visits: ${r.visits} · LGAs: ${r.lgas.size}` : ""),
      { sticky: true }
    );
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Compass className="h-5 w-5 text-primary" />
          MDA Supervisory Visit Map of Nigeria
        </CardTitle>
        <CardDescription>
          {formName ? `${formName} — ` : ""}Mass Drug Administration (MDA) supervisory field
          monitoring, computed from submission GPS.
          {monitoringPeriod ? ` Monitoring period: ${monitoringPeriod}.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile
            icon={<MapPin className="h-4 w-4" />}
            label="States Visited"
            value={`${kpis.statesVisited}`}
            sub={`of ${kpis.totalStates} States + FCT`}
          />
          <KpiTile
            icon={<ClipboardList className="h-4 w-4" />}
            label="LGAs Covered"
            value={`${kpis.lgasCovered}`}
            sub="across visited states"
          />
          <KpiTile
            icon={<Users className="h-4 w-4" />}
            label="Supervisors Deployed"
            value={`${kpis.supervisorsDeployed}`}
            sub="field supervisors"
          />
          <KpiTile
            icon={<FileCheck className="h-4 w-4" />}
            label="Reporting Status"
            value={`${kpis.reportingRate}%`}
            sub="reports finalized"
          />
        </div>

        <div className="relative rounded-xl overflow-hidden border border-border" style={{ height: 520 }}>
          <MapContainer
            center={[9.082, 8.6753]}
            zoom={6}
            style={{ height: "100%", width: "100%", background: "#0f172a" }}
            scrollWheelZoom
          >
            <TileLayer
              url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; OpenStreetMap'
            />
            {geoData && (
              <GeoJSON data={geoData as any} style={geoStyle as any} onEachFeature={onEachFeature} />
            )}
            {NIGERIAN_STATES.map((s) => {
              const status = statusForState(s.name);
              const r = rollupByState.get(s.name);
              const radius = Math.max(6, Math.min(22, 6 + (r?.visits ?? 0) * 1.5));
              return (
                <CircleMarker
                  key={s.name}
                  center={[s.lat, s.lng]}
                  radius={radius}
                  pathOptions={{
                    color: "#fff",
                    weight: 1.5,
                    fillColor: STATUS_STYLE[status].color,
                    fillOpacity: 0.9,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -6]}>
                    <div className="text-xs">
                      <div className="font-semibold">{s.name}</div>
                      <div>{STATUS_STYLE[status].label}</div>
                      {r && (
                        <div className="text-muted-foreground">
                          {r.visits} visit{r.visits === 1 ? "" : "s"} · {r.lgas.size} LGA(s)
                        </div>
                      )}
                    </div>
                  </Tooltip>
                  <Popup>
                    <div className="text-xs space-y-1">
                      <div className="font-semibold text-sm">{s.name}</div>
                      <div>Status: <strong>{STATUS_STYLE[status].label}</strong></div>
                      <div>Supervisory visits: {r?.visits ?? 0}</div>
                      <div>LGAs covered: {r?.lgas.size ?? 0}</div>
                      <div>Supervisors: {r?.supervisors.size ?? 0}</div>
                      <div>
                        Reporting: {r ? Math.round((r.finalized / Math.max(1, r.total)) * 100) : 0}%
                      </div>
                      {r?.lastVisit && (
                        <div className="text-muted-foreground">
                          Last visit: {new Date(r.lastVisit).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>

          {/* Legend */}
          <div className="absolute bottom-3 right-3 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border p-3 text-xs space-y-1.5 z-[400]">
            <div className="font-semibold mb-1">Legend</div>
            {(Object.entries(STATUS_STYLE) as [Status, (typeof STATUS_STYLE)[Status]][]).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full border border-white"
                  style={{ backgroundColor: v.color }}
                />
                <span>{v.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* State breakdown */}
        <div>
          <div className="text-sm font-semibold mb-2">State-level rollup</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left py-2 px-2">State</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-right py-2 px-2">Visits</th>
                  <th className="text-right py-2 px-2">LGAs</th>
                  <th className="text-right py-2 px-2">Supervisors</th>
                  <th className="text-right py-2 px-2">Reporting %</th>
                </tr>
              </thead>
              <tbody>
                {NIGERIAN_STATES.map((s) => {
                  const r = rollupByState.get(s.name);
                  const status = statusForState(s.name);
                  return (
                    <tr key={s.name} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-1.5 px-2">{s.name}</td>
                      <td className="py-1.5 px-2">
                        <Badge variant="outline" style={{ color: STATUS_STYLE[status].color, borderColor: STATUS_STYLE[status].color }}>
                          {STATUS_STYLE[status].label}
                        </Badge>
                      </td>
                      <td className="text-right py-1.5 px-2">{r?.visits ?? 0}</td>
                      <td className="text-right py-1.5 px-2">{r?.lgas.size ?? 0}</td>
                      <td className="text-right py-1.5 px-2">{r?.supervisors.size ?? 0}</td>
                      <td className="text-right py-1.5 px-2">
                        {r ? Math.round((r.finalized / Math.max(1, r.total)) * 100) : 0}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-card to-muted/40 p-3 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
