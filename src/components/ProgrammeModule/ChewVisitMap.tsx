// Map of community health worker home visits.
//
// Each dispatched visit is drawn at the beneficiary's recorded home location,
// coloured by visit status, with the treating facilities shown for context so
// a coordinator can plan a route.

import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPinned } from "lucide-react";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import type { FacilityRow } from "@/lib/programmeModule/facilities";

export interface MapVisit {
  id: string;
  beneficiary_id: string;
  assigned_name: string | null;
  risk_score: number | null;
  risk_band: string | null;
  due_date: string | null;
  status: string;
  outcome: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  dispatched: "#d64550",
  in_progress: "#e3b23c",
  completed: "#0f9b8e",
  cancelled: "#8a94a6",
};

const STATUS_LABEL: Record<string, string> = {
  dispatched: "Dispatched",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

interface Props {
  visits: MapVisit[];
  beneficiaries: BeneficiaryRow[];
  facilities: FacilityRow[];
}

const ChewVisitMap = ({ visits, beneficiaries, facilities }: Props) => {
  const byId = useMemo(() => new Map(beneficiaries.map((b) => [b.id, b])), [beneficiaries]);

  const points = useMemo(() => visits.flatMap((v) => {
    const b = byId.get(v.beneficiary_id);
    if (!b || b.latitude == null || b.longitude == null) return [];
    return [{ visit: v, beneficiary: b, lat: Number(b.latitude), lng: Number(b.longitude) }];
  }), [visits, byId]);

  const facilityPoints = useMemo(
    () => facilities.filter((f) => f.latitude != null && f.longitude != null),
    [facilities],
  );

  const centre = useMemo<[number, number]>(() => {
    const all = [
      ...points.map((p) => [p.lat, p.lng] as [number, number]),
      ...facilityPoints.map((f) => [Number(f.latitude), Number(f.longitude)] as [number, number]),
    ];
    if (!all.length) return [9.082, 8.6753]; // Nigeria
    const lat = all.reduce((a, p) => a + p[0], 0) / all.length;
    const lng = all.reduce((a, p) => a + p[1], 0) / all.length;
    return [lat, lng];
  }, [points, facilityPoints]);

  const missing = visits.length - points.length;

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MapPinned className="h-5 w-5 text-primary" />
        <div className="min-w-0">
          <h4 className="font-semibold text-foreground">Home visits on the map</h4>
          <p className="text-xs text-muted-foreground">
            Every dispatched visit at the household's recorded location, with the treating facilities for context.
          </p>
        </div>
        <div className="flex-1" />
        {Object.entries(STATUS_LABEL).map(([k, label]) => (
          <Badge key={k} variant="outline" className="gap-1.5 border">
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[k] }} />
            {label}
          </Badge>
        ))}
      </div>

      <div className="h-[420px] overflow-hidden rounded-lg border border-border">
        <MapContainer center={centre} zoom={points.length ? 9 : 6} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {facilityPoints.map((f) => (
            <CircleMarker
              key={f.id}
              center={[Number(f.latitude), Number(f.longitude)]}
              radius={7}
              pathOptions={{ color: "#00538f", fillColor: "#00538f", fillOpacity: 0.25, weight: 2 }}
            >
              <Tooltip>{f.name}</Tooltip>
            </CircleMarker>
          ))}
          {points.map((p) => (
            <CircleMarker
              key={p.visit.id}
              center={[p.lat, p.lng]}
              radius={8}
              pathOptions={{
                color: STATUS_COLOR[p.visit.status] || "#8a94a6",
                fillColor: STATUS_COLOR[p.visit.status] || "#8a94a6",
                fillOpacity: 0.75,
                weight: 2,
              }}
            >
              <Tooltip>{p.beneficiary.full_name} · {STATUS_LABEL[p.visit.status] || p.visit.status}</Tooltip>
              <Popup>
                <div className="space-y-0.5 text-xs">
                  <p className="text-sm font-semibold">{p.beneficiary.full_name}</p>
                  <p>{p.beneficiary.case_id}</p>
                  <p>Risk score: {p.visit.risk_score ?? "—"}</p>
                  <p>Worker: {p.visit.assigned_name || "Unassigned"}</p>
                  <p>Due: {p.visit.due_date ? new Date(p.visit.due_date).toLocaleDateString() : "—"}</p>
                  <p>Status: {STATUS_LABEL[p.visit.status] || p.visit.status}</p>
                  {p.visit.outcome && <p>Outcome: {p.visit.outcome.replace(/_/g, " ")}</p>}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {points.length} visit{points.length === 1 ? "" : "s"} mapped
        {missing > 0 && ` · ${missing} without a recorded home location`}
      </p>
    </Card>
  );
};

export default ChewVisitMap;
